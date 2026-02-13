package codexproxy

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strings"

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
		SetRetryCount(0)
	for key, values := range headers {
		for _, value := range values {
			es.AddHeader(key, value)
		}
	}

	headerChan := make(chan http.Header, 1)
	messageChan := make(chan sseMessage, 16)
	usage := tokenUsage{}

	es.OnOpen(func(_ string, responseHeaders http.Header) {
		headerChan <- responseHeaders.Clone()
	})

	es.OnMessage(func(eventAny any) {
		event := eventAny.(*resty.Event)
		messageChan <- sseMessage{
			name: event.Name,
			data: event.Data,
		}
	}, nil)

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
	case responseHeaders := <-headerChan:
		copyResponseHeaders(c.Writer.Header(), responseHeaders)
		c.Status(http.StatusOK)
		for msg := range messageChan {
			updateUsageFromSSEEventData(msg.data, &usage)
			c.SSEvent(msg.name, msg.data)
			c.Writer.Flush()
		}
		upstreamErr := <-esErrChan
		if upstreamErr != nil && !errors.Is(upstreamErr, io.EOF) {
			return usage, errors.Join(ErrUpstreamRequestFail, upstreamErr)
		}
		return usage, nil
	case upstreamErr := <-esErrChan:
		if upstreamErr != nil && !errors.Is(upstreamErr, io.EOF) {
			return usage, errors.Join(ErrUpstreamRequestFail, upstreamErr)
		}
		return usage, nil
	}
}

// updateUsageFromSSEDataLine 从 SSE data 行里提取并更新 usage。
func updateUsageFromSSEDataLine(line string, usage *tokenUsage) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "data:") {
		return
	}

	rawJSON := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
	updateUsageFromSSEEventData(rawJSON, usage)
}

// updateUsageFromSSEEventData 从 SSE 事件 data 字段里提取并更新 usage。
func updateUsageFromSSEEventData(rawJSON string, usage *tokenUsage) {
	if rawJSON == "" || rawJSON == "[DONE]" {
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
