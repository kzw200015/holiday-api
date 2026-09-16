package eh

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"

	"myapi/internal/signing"
)

// 用内存响应验证完整请求链路，避免测试依赖真实 e 站和账号。
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSearchGalleriesPreservesOrderAcrossCacheEviction(t *testing.T) {
	var links strings.Builder
	for gid := 1; gid <= 28; gid++ {
		fmt.Fprintf(&links, `<a href="/g/%d/0123456789/">图集</a>`, gid)
	}
	links.WriteString(`<a id="unext" href="/?next=100">下一页</a>`)
	var batches []int
	client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method == http.MethodGet {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(links.String()))}, nil
		}
		var payload struct {
			GIDList [][2]json.RawMessage `json:"gidlist"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		batches = append(batches, len(payload.GIDList))
		var entries []string
		// 上游顺序与请求相反，且一条被删除；结果仍应保留请求顺序并跳过该条。
		for i := len(payload.GIDList) - 1; i >= 0; i-- {
			gid := string(payload.GIDList[i][0])
			if gid == "3" {
				entries = append(entries, `{"gid":3,"error":"deleted"}`)
			} else {
				entries = append(entries, fmt.Sprintf(`{"gid":%s,"title":"gallery %s"}`, gid, gid))
			}
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(
			`{"gmetadata":[` + strings.Join(entries, ",") + `]}`)), Header: make(http.Header)}, nil
	}))
	credentials, _ := newCredentialTestStore(Cookie{})
	service := NewService(nil, client, credentials, nil, signing.NewAttachmentSigner("test", time.Hour))
	// 缩小容量，确定性模拟其他请求淘汰本次已命中的缓存，以及批次之间相互淘汰。
	service.galleries = expirable.NewLRU[int64, GalleryDetail](1, nil, time.Minute)
	service.galleries.Add(1, GalleryDetail{GalleryCard: GalleryCard{GID: 1, Title: "cached"}})
	result, err := service.SearchGalleries(context.Background(), 1, SearchQuery{CategoryFilter: -1})
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(batches) != "[25 2]" {
		t.Fatalf("上游批次 = %v，期望 [25 2]", batches)
	}
	if len(result.Items) != 27 {
		t.Fatalf("返回 %d 条，期望 27 条", len(result.Items))
	}
	for i, gallery := range result.Items {
		want := int64(i + 1)
		if want >= 3 {
			want++
		}
		if gallery.GID != want {
			t.Errorf("第 %d 条 gid = %d，期望 %d", i, gallery.GID, want)
		}
	}
	if result.Items[0].Title != "cached" {
		t.Errorf("已命中的数据未保留：%+v", result.Items[0])
	}
	if result.NextCursor == nil || *result.NextCursor != "100" {
		t.Errorf("下一页游标 = %v，期望 100", result.NextCursor)
	}
}
