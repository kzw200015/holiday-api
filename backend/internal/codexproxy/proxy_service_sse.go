package codexproxy

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	resty "resty.dev/v3"
)

type sseMessage struct {
	name string
	data string
}

// forwardSSEWithEventSource 使用 Resty v3 EventSource 透传 SSE 并持续更新 token 使用量。
func (s *ProxyService) forwardSSEWithEventSource(c *gin.Context, body []byte, headers http.Header) (tokenUsage, error) {
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

	var openOnce sync.Once
	es.OnOpen(func(_ string, responseHeaders http.Header) {
		openOnce.Do(func() {
			headerChan <- responseHeaders.Clone()
		})
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

	done := make(chan error, 1)
	go func() {
		defer close(messageChan)
		defer close(headerChan)
		done <- es.Get()
		close(done)
	}()

	opened := false
	gotUpstreamErr := false
	var upstreamErr error
	select {
	case responseHeaders, ok := <-headerChan:
		if ok {
			copyResponseHeaders(c.Writer.Header(), responseHeaders)
			c.Status(http.StatusOK)
			opened = true
		}
	case upstreamErr = <-done:
		gotUpstreamErr = true
	}

	if opened {
		c.Stream(func(w io.Writer) bool {
			msg, ok := <-messageChan
			if !ok {
				return false
			}
			updateUsageFromSSEEventData(msg.data, &usage)
			c.SSEvent(msg.name, msg.data)
			return true
		})
	}

	if !gotUpstreamErr {
		upstreamErr = <-done
	}

	if upstreamErr != nil && !errors.Is(upstreamErr, io.EOF) && c.Request.Context().Err() == nil {
		return usage, ErrUpstreamRequestFail
	}
	return usage, nil
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
