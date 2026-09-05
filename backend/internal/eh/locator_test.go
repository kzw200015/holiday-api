package eh

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestGalleryPageCancellationKeepsSharedRequest(t *testing.T) {
	started := make(chan context.Context, 1)
	release := make(chan struct{})
	defer close(release)
	client := NewClient("test", 5*time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		started <- r.Context()
		select {
		case <-release:
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader("gallery"))}, nil
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
	}))
	locator := NewImageLocator(client)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := locator.GalleryPage(ctx, RequestContext{Site: SiteE}, GalleryRef{GID: 1, Token: "0123456789"}, 0)
		done <- err
	}()
	var upstream context.Context
	select {
	case upstream = <-started:
	case <-time.After(time.Second):
		t.Fatal("共享请求未启动")
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("取消等待返回 %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("已取消的读者仍在等待上游")
	}
	if upstream.Err() != nil {
		t.Fatalf("读者取消中断了共享请求：%v", upstream.Err())
	}
	// 已取消的读者离开后，同一片的请求仍须加入正在执行的调用。
	joined := locator.slices.DoChan("e:1:0", func() (any, error) {
		return nil, errors.New("共享请求被过早移除")
	})
	release <- struct{}{}
	select {
	case result := <-joined:
		if result.Err != nil || result.Val != "gallery" || !result.Shared {
			t.Fatalf("共享结果 = %+v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("共享请求未完成")
	}
}
