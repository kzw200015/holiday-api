package eh

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

// OpenImage 成功时返回已校验的图片流，由调用方关闭；失败时由 Client 关闭响应体。
// 主机白名单在唯一接受任意上游地址的入口校验。
func (c *Client) OpenImage(ctx context.Context, url string) (*Attachment, error) {
	if !IsAllowedImageURL(url) {
		slog.Warn("图片地址不在白名单内，已拒绝", "url", url)
		return nil, errUnavailable("图片地址不在允许的范围内")
	}

	// 一个 Cookie 都不带：图床不认 e 站的身份，发过去只是白白泄露给第三方主机。
	// 也不套总超时：响应体是流式转发给浏览器的，读多久由 ctx（浏览器还在不在）决定
	response, err := c.do(ctx, http.MethodGet, url, "", nil)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		if response.StatusCode == 509 {
			return nil, errQuotaExceeded()
		}
		failure := &imageNodeError{status: response.StatusCode}
		return nil, errUpstream(failure, failure.Error())
	}
	return toAttachment(response)
}

// Attachment 包含已校验的图片流及转发所需的响应头。
type Attachment struct {
	ContentType string
	// 上游给的长度，可能为空（分块传输）。
	ContentLength string
	// 上游地址，只用于转发中断时的日志。
	Source string
	Body   io.ReadCloser
}

// 上游出错时回的是 HTML 错误页，原样转发会让浏览器显示一张裂图，日志里也查不出原因。
func toAttachment(response *http.Response) (*Attachment, error) {
	contentType := response.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		response.Body.Close()
		if contentType == "" {
			contentType = "无类型"
		}
		return nil, errUnavailable("图床返回的不是图片（%s）", contentType)
	}
	return &Attachment{
		ContentType:   contentType,
		ContentLength: response.Header.Get("Content-Length"),
		Source:        response.Request.URL.String(),
		Body:          response.Body,
	}, nil
}
