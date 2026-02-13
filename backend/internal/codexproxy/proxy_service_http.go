package codexproxy

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// forwardHTTP 透传普通 HTTP 响应并提取 token 使用量。
func (s *ProxyService) forwardHTTP(c *gin.Context, body []byte, headers http.Header) (tokenUsage, error) {
	usage := tokenUsage{}
	req := s.httpClient.R().
		SetContext(c.Request.Context()).
		SetBody(body).
		SetDoNotParseResponse(true)

	req.SetHeaderMultiValues(headers)

	resp, err := req.Post(codexResponsesURL)
	if err != nil {
		return usage, errors.Join(ErrUpstreamRequestFail, err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	upstreamResp := resp.RawResponse
	responseBody, readErr := io.ReadAll(upstreamResp.Body)
	if readErr != nil {
		c.Status(http.StatusBadGateway)
		return usage, nil
	}
	parsedUsage := parseUsageFromResponseBody(responseBody)
	usage = parsedUsage

	writeHTTPResponse(c, upstreamResp.StatusCode, upstreamResp.Header, responseBody)
	return usage, nil
}

// writeHTTPResponse 按上游响应状态与头部写回下游。
func writeHTTPResponse(c *gin.Context, statusCode int, headers http.Header, body []byte) {
	copyResponseHeaders(c.Writer.Header(), headers)
	c.Status(statusCode)
	_, _ = c.Writer.Write(body)
}

// parseUsageFromResponseBody 从普通 JSON 响应中提取 usage 字段。
func parseUsageFromResponseBody(body []byte) tokenUsage {
	if !gjson.ValidBytes(body) {
		return tokenUsage{}
	}

	return tokenUsage{
		InputTokens:       int(gjson.GetBytes(body, "usage.input_tokens").Int()),
		CachedInputTokens: int(gjson.GetBytes(body, "usage.input_tokens_details.cached_tokens").Int()),
		OutputTokens:      int(gjson.GetBytes(body, "usage.output_tokens").Int()),
	}
}
