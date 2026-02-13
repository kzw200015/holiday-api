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

// forwardSSEWithEventSource 使用 Resty v3 EventSource 透传 SSE 并持续更新 token 使用量。
func (s *ProxyService) forwardSSEWithEventSource(c *gin.Context, body []byte, headers http.Header) (tokenUsage, error) {
	type sseMessage struct {
		name string
		data string
	}
	type failureResponse struct {
		statusCode int
		headers    http.Header
		body       []byte
	}

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

	clientChan := make(chan sseMessage)
	esDone := make(chan struct{})
	usage := tokenUsage{}
	var streamErr error
	var failedResp *failureResponse

	es.OnOpen(func(_ string, responseHeaders http.Header) {
		copyResponseHeaders(c.Writer.Header(), responseHeaders)
		c.Status(http.StatusOK)
	})

	es.OnRequestFailure(func(_ error, response *http.Response) {
		if response == nil {
			return
		}
		defer func() {
			_ = response.Body.Close()
		}()

		responseBody, readErr := io.ReadAll(response.Body)
		if readErr != nil {
			streamErr = readErr
			return
		}
		failedResp = &failureResponse{
			statusCode: response.StatusCode,
			headers:    response.Header.Clone(),
			body:       responseBody,
		}
	})

	es.OnMessage(func(eventAny any) {
		event := eventAny.(*resty.Event)
		updateUsageFromSSEEventData(event.Data, &usage)
		clientChan <- sseMessage{
			name: event.Name,
			data: event.Data,
		}
	}, nil)

	done := make(chan struct{})
	go func() {
		select {
		case <-c.Request.Context().Done():
			es.Close()
		case <-done:
		}
	}()
	defer close(done)

	go func() {
		defer close(esDone)
		err := es.Get()
		if err != nil && !errors.Is(err, io.EOF) {
			streamErr = err
		}
		close(clientChan)
	}()

	c.Stream(func(w io.Writer) bool {
		if msg, ok := <-clientChan; ok {
			c.SSEvent(msg.name, msg.data)
			return true
		}
		return false
	})

	<-esDone
	if failedResp != nil {
		writeHTTPResponse(c, failedResp.statusCode, failedResp.headers, failedResp.body)
		return usage, nil
	}
	if streamErr != nil && c.Request.Context().Err() == nil {
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
