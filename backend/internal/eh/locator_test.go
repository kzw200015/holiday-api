package eh

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
)

func testPageResponse(request *http.Request, body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Request: request}
}

func TestGalleryPageCancellationKeepsSharedRequest(t *testing.T) {
	started := make(chan context.Context, 1)
	release := make(chan struct{})
	defer close(release)
	client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		started <- r.Context()
		select {
		case <-release:
			return testPageResponse(r, galleryPageHTML), nil
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
}

func TestGalleryPageIsolatesConcurrentCredentials(t *testing.T) {
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	defer close(release)
	client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		started <- struct{}{}
		select {
		case <-release:
			member, _ := r.Cookie("ipb_member_id")
			return testPageResponse(r, fmt.Sprintf(`<a href="/s/0123456789/1-1">%s</a>`, member.Value)), nil
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
	}))
	locator := NewImageLocator(client)
	results := make(chan gallerySlice, 2)
	for _, member := range []string{"first", "second"} {
		go func() {
			page, _ := locator.GalleryPage(context.Background(), RequestContext{Site: SiteE, Credential: &Cookie{IpbMemberID: member}}, GalleryRef{GID: 1, Token: "0123456789"}, 0)
			results <- page
		}()
	}
	for range 2 {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("不同凭据的页面请求被合并")
		}
	}
	release <- struct{}{}
	release <- struct{}{}
	first, second := <-results, <-results
	if first.HTML == second.HTML || first.HTML == "" || second.HTML == "" {
		t.Fatalf("不同身份收到相同页面：%q / %q", first.HTML, second.HTML)
	}
}

func TestResolveUsesReturnedTokensAfterCacheEviction(t *testing.T) {
	var sliceCalls atomic.Int32
	client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if strings.HasPrefix(r.URL.Path, "/g/") {
			sliceCalls.Add(1)
			var body strings.Builder
			body.WriteString("Showing 1 - 20 of 100")
			for page := 1; page <= 20; page++ {
				fmt.Fprintf(&body, `<a href="/s/0123456789/1-%d">page</a>`, page)
			}
			return testPageResponse(r, body.String()), nil
		}
		return testPageResponse(r, `<img id="img" src="https://ehgt.org/image.webp">`), nil
	}))
	locator := NewImageLocator(client)
	// 分片包含的令牌多于整个缓存容量；每一页仍必须从本次结果中找到自己的令牌。
	locator.pageTokens = expirable.NewLRU[imageCacheKey, string](1, nil, time.Minute)
	for page := 1; page <= 20; page++ {
		locator.pageTokens.Purge()
		url, err := locator.Resolve(context.Background(), RequestContext{Site: SiteE}, GalleryRef{GID: 1, Token: "0123456789"}, page)
		if err != nil || url != "https://ehgt.org/image.webp" {
			t.Fatalf("第 %d 页 = %q, %v", page, url, err)
		}
	}
	if sliceCalls.Load() != 20 {
		t.Fatalf("分片请求 = %d，期望每页仅请求一次", sliceCalls.Load())
	}
}

func TestResolveIsolatesCachedImagesByCredentialAndGalleryToken(t *testing.T) {
	var calls int
	client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if strings.HasPrefix(r.URL.Path, "/g/") {
			return testPageResponse(r, `<a href="/s/0123456789/1-1">page</a>`), nil
		}
		calls++
		return testPageResponse(r, fmt.Sprintf(`<img id="img" src="https://ehgt.org/%d.webp">`, calls)), nil
	}))
	locator := NewImageLocator(client)
	ref := GalleryRef{GID: 1, Token: "0123456789"}
	for i, rc := range []RequestContext{
		{Site: SiteE},
		{Site: SiteE, Credential: &Cookie{IpbMemberID: "1", IpbPassHash: "first"}},
		{Site: SiteE, Credential: &Cookie{IpbMemberID: "1", IpbPassHash: "changed"}},
		{Site: SiteEx, Credential: &Cookie{IpbMemberID: "1", IpbPassHash: "changed"}},
	} {
		url, err := locator.Resolve(context.Background(), rc, ref, 1)
		if err != nil || url != fmt.Sprintf("https://ehgt.org/%d.webp", i+1) {
			t.Fatalf("身份 %d 命中其他身份的缓存：%q, %v", i, url, err)
		}
		cached, err := locator.Resolve(context.Background(), rc, ref, 1)
		if err != nil || cached != url || calls != i+1 {
			t.Fatalf("同一身份未复用缓存：%q, %v", cached, err)
		}
	}
	ref.Token = "aaaaaaaaaa"
	if _, err := locator.Resolve(context.Background(), RequestContext{Site: SiteE}, ref, 1); err != nil || calls != 5 {
		t.Fatalf("新图集令牌复用了旧缓存：calls=%d, err=%v", calls, err)
	}
}

func TestResolveOnlyFallsBackForExpiredShowKey(t *testing.T) {
	for _, response := range []string{`{"error":"Key mismatch"}`, `{"error":"quota denied"}`, `{"i3":"unexpected"}`} {
		t.Run(response, func(t *testing.T) {
			var pageCalls int
			client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.Method == http.MethodPost {
					return testPageResponse(r, response), nil
				}
				pageCalls++
				return testPageResponse(r, `<img id="img" src="https://ehgt.org/new.webp">`), nil
			}))
			locator := NewImageLocator(client)
			rc, ref := RequestContext{Site: SiteE}, GalleryRef{GID: 1, Token: "0123456789"}
			key := galleryCacheKey{scope: rc.scope(), ref: ref}
			locator.pageTokens.Add(imageCacheKey{gallery: key, page: 1}, "0123456789")
			locator.showKeys.Add(key, "old")
			url, err := locator.Resolve(context.Background(), rc, ref, 1)
			if strings.Contains(response, "Key mismatch") {
				if err != nil || url != "https://ehgt.org/new.webp" || pageCalls != 1 {
					t.Fatalf("失效回退 = %q, %v, calls=%d", url, err, pageCalls)
				}
			} else if err == nil || pageCalls != 0 {
				t.Fatalf("普通协议错误被吞掉：err=%v, calls=%d", err, pageCalls)
			}
		})
	}
}

func TestRefreshObtainsReloadTokenFromTheFailedPage(t *testing.T) {
	var requests []string
	client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.URL.RequestURI())
		if r.URL.Query().Get("nl") == "current-page" {
			return testPageResponse(r, `<img id="img" src="https://ehgt.org/replaced.webp">`), nil
		}
		return testPageResponse(r, `<img id="img" src="https://ehgt.org/failed.webp" onerror="nl('current-page')">`), nil
	}))
	locator := NewImageLocator(client)
	rc, ref := RequestContext{Site: SiteE}, GalleryRef{GID: 1, Token: "0123456789"}
	key := galleryCacheKey{scope: rc.scope(), ref: ref}
	locator.pageTokens.Add(imageCacheKey{gallery: key, page: 2}, "bbbbbbbbbb")
	locator.images.Add(imageCacheKey{gallery: key, page: 1}, imagePage{ImageURL: "https://ehgt.org/first.webp", ReloadToken: "another-page"})
	locator.images.Add(imageCacheKey{gallery: key, page: 2}, imagePage{ImageURL: "https://ehgt.org/failed.webp"})
	url, err := locator.Refresh(context.Background(), rc, ref, 2)
	if err != nil || url != "https://ehgt.org/replaced.webp" {
		t.Fatalf("换源结果 = %q, %v", url, err)
	}
	if fmt.Sprint(requests) != "[/s/bbbbbbbbbb/1-2 /s/bbbbbbbbbb/1-2?nl=current-page]" {
		t.Fatalf("换源请求没有使用当前图片页的令牌：%v", requests)
	}
}
