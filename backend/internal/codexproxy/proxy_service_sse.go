package codexproxy

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
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

	var event struct {
		Usage struct {
			InputTokens       int `json:"input_tokens"`
			OutputTokens      int `json:"output_tokens"`
			InputTokenDetails struct {
				CachedTokens int `json:"cached_tokens"`
			} `json:"input_tokens_details"`
		} `json:"usage"`
		Response struct {
			Usage struct {
				InputTokens       int `json:"input_tokens"`
				OutputTokens      int `json:"output_tokens"`
				InputTokenDetails struct {
					CachedTokens int `json:"cached_tokens"`
				} `json:"input_tokens_details"`
			} `json:"usage"`
		} `json:"response"`
	}
	if err := json.Unmarshal([]byte(rawJSON), &event); err != nil {
		return
	}

	if event.Response.Usage.InputTokens > 0 || event.Response.Usage.OutputTokens > 0 {
		usage.InputTokens = event.Response.Usage.InputTokens
		usage.CachedInputTokens = event.Response.Usage.InputTokenDetails.CachedTokens
		usage.OutputTokens = event.Response.Usage.OutputTokens
		return
	}
	if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
		usage.InputTokens = event.Usage.InputTokens
		usage.CachedInputTokens = event.Usage.InputTokenDetails.CachedTokens
		usage.OutputTokens = event.Usage.OutputTokens
	}
}
