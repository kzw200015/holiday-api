package codexproxy

import (
	"bytes"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	resty "resty.dev/v3"
)

type sseMessage struct {
	name string
	data string
}

// forwardSSE 使用 Resty v3 EventSource 透传 SSE 并持续更新 token 使用量。
func (s *ProxyService) forwardSSE(c *gin.Context, body []byte, headers http.Header) (tokenUsage, error) {
	es := resty.NewEventSource().
		SetURL(codexResponsesURL).
		SetMethod(resty.MethodPost).
		SetBody(bytes.NewReader(body)).
		SetMaxBufSize(1024 * 1024).SetRetryCount(3)
	for key, values := range headers {
		for _, value := range values {
			es.AddHeader(key, value)
		}
	}

	headerChan := make(chan struct{}, 1)
	messageChan := make(chan sseMessage, 16)
	usage := tokenUsage{}

	es.OnOpen(func(_ string, _ http.Header) {
		headerChan <- struct{}{}
	})

	es.OnMessage(func(eventAny any) {
		event := eventAny.(*resty.Event)
		messageChan <- sseMessage{
			name: event.Name,
			data: event.Data,
		}
	}, nil)

	es.OnRequestFailure(func(err error, res *http.Response) {
		resBody, readErr := io.ReadAll(res.Body)
		if readErr != nil {
			slog.ErrorContext(c.Request.Context(), "read SSE failure response body failed", "err", readErr)
			return
		}
		slog.WarnContext(c.Request.Context(), "SSE request failure", "err", err, "res", string(resBody))
	})

	go func() {
		<-c.Request.Context().Done()
		es.Close()
	}()

	esErrChan := make(chan error, 1)
	go func() {
		defer close(messageChan)
		esErrChan <- es.Get()
	}()

	select {
	case <-headerChan:
		c.Status(http.StatusOK)
		for msg := range messageChan {
			updateUsageFromSSEEventData(msg.data, &usage)
			c.SSEvent(msg.name, msg.data)
			c.Writer.Flush()
		}
		upstreamErr := <-esErrChan
		if upstreamErr != nil && !errors.Is(upstreamErr, io.EOF) {
			slog.ErrorContext(c.Request.Context(), "forward SSE failed after stream opened", "err", upstreamErr)
			return usage, upstreamErr
		}
		return usage, nil
	case upstreamErr := <-esErrChan:
		if upstreamErr != nil && !errors.Is(upstreamErr, io.EOF) {
			slog.ErrorContext(c.Request.Context(), "forward SSE failed before stream opened", "err", upstreamErr)
			return usage, upstreamErr
		}
		return usage, nil
	}
}

// updateUsageFromSSEEventData 从 SSE 事件 data 字段里提取并更新 usage。
func updateUsageFromSSEEventData(rawJSON string, usage *tokenUsage) {
	if rawJSON == "" {
		return
	}

	if !gjson.Valid(rawJSON) {
		return
	}

	responseInputTokens := int(gjson.Get(rawJSON, "response.usage.input_tokens").Int())
	responseOutputTokens := int(gjson.Get(rawJSON, "response.usage.output_tokens").Int())
	if responseInputTokens > 0 || responseOutputTokens > 0 {
		usage.InputTokens = responseInputTokens
		usage.CachedInputTokens = int(gjson.Get(rawJSON, "response.usage.input_tokens_details.cached_tokens").Int())
		usage.OutputTokens = responseOutputTokens
		return
	}

	inputTokens := int(gjson.Get(rawJSON, "usage.input_tokens").Int())
	outputTokens := int(gjson.Get(rawJSON, "usage.output_tokens").Int())
	if inputTokens > 0 || outputTokens > 0 {
		usage.InputTokens = inputTokens
		usage.CachedInputTokens = int(gjson.Get(rawJSON, "usage.input_tokens_details.cached_tokens").Int())
		usage.OutputTokens = outputTokens
	}
}
