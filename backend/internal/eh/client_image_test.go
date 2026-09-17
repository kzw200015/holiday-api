package eh

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"myapi/internal/apperr"
	"myapi/internal/signing"
)

type trackedImageBody struct {
	io.Reader
	closes int
}

func (b *trackedImageBody) Close() error {
	b.closes++
	return nil
}

func TestOpenImageOwnsFailedResponses(t *testing.T) {
	for _, each := range []struct {
		name        string
		status      int
		contentType string
		kind        apperr.Kind
		retry       bool
	}{
		{"图片", 200, "image/webp", "", false},
		{"节点失败", 403, "image/webp", apperr.UpstreamFailure, true},
		{"额度耗尽", 509, "text/html", apperr.ResourceExhausted, false},
		{"错误页面", 200, "text/html", apperr.UpstreamFailure, false},
	} {
		t.Run(each.name, func(t *testing.T) {
			body := &trackedImageBody{Reader: strings.NewReader("image")}
			client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.Header.Get("Cookie") != "" {
					t.Fatal("图床请求携带了凭据")
				}
				return &http.Response{StatusCode: each.status, Header: http.Header{"Content-Type": {each.contentType}}, Body: body, Request: r}, nil
			}))
			image, err := client.OpenImage(context.Background(), "https://ehgt.org/image.webp")
			if each.kind == "" {
				if err != nil || image == nil || body.closes != 0 {
					t.Fatalf("成功图片没有移交有效流：%+v, %v, closes=%d", image, err, body.closes)
				}
				data, _ := io.ReadAll(image.Body)
				image.Body.Close()
				if string(data) != "image" || body.closes != 1 {
					t.Fatal("图片无法读取或无法关闭")
				}
				return
			}
			var failure *apperr.Error
			var nodeFailure *imageNodeError
			if image != nil || !errors.As(err, &failure) || failure.Kind != each.kind || body.closes != 1 {
				t.Fatalf("失败契约不成立：image=%+v, err=%v, closes=%d", image, err, body.closes)
			}
			if errors.As(err, &nodeFailure) != each.retry {
				t.Fatalf("错误换源分类：%v", err)
			}
		})
	}
}

func TestGalleryImageRetriesNodeFailureOnce(t *testing.T) {
	for _, retryStatus := range []int{200, 403, 509} {
		t.Run(http.StatusText(retryStatus), func(t *testing.T) {
			var imageRequests, pageRequests int
			var bodies []*trackedImageBody
			client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
				switch {
				case strings.HasPrefix(r.URL.Path, "/g/"):
					return testPageResponse(r, `<a href="/s/0123456789/1-1">page</a>`), nil
				case strings.HasPrefix(r.URL.Path, "/s/"):
					pageRequests++
					if pageRequests == 2 && r.URL.Query().Get("nl") != "page-one" {
						t.Fatalf("换源没有使用当前页令牌：%s", r.URL)
					}
					return testPageResponse(r, `<img id="img" src="https://ehgt.org/image.webp" onerror="nl('page-one')">`), nil
				default:
					imageRequests++
					status := http.StatusForbidden
					if imageRequests == 2 {
						status = retryStatus
					}
					body := &trackedImageBody{Reader: strings.NewReader("image")}
					bodies = append(bodies, body)
					return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": {"image/webp"}}, Body: body, Request: r}, nil
				}
			}))
			credentials, _ := newCredentialTestStore(Cookie{})
			signer := signing.NewAttachmentSigner("test", time.Hour)
			service := NewService(nil, client, credentials, NewImageLocator(client), signer)
			ref := GalleryRef{GID: 1, Token: "0123456789"}
			image, err := service.OpenGalleryImage(context.Background(), 1, ref, 1, signer.Sign(imageSubject(1, ref)))
			if retryStatus == 200 {
				if err != nil || image == nil {
					t.Fatalf("换源失败：%v", err)
				}
				image.Body.Close()
			} else if err == nil || image != nil {
				t.Fatalf("失败响应被当作图片：%+v, %v", image, err)
			}
			if imageRequests != 2 || pageRequests != 2 {
				t.Fatalf("重试次数错误：图片=%d, 页面=%d", imageRequests, pageRequests)
			}
			for _, body := range bodies {
				if body.closes != 1 {
					t.Fatalf("响应体关闭次数 = %d", body.closes)
				}
			}
		})
	}
}
