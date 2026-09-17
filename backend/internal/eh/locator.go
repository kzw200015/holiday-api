package eh

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"golang.org/x/sync/singleflight"
)

// 详情页分片大小受账号设置影响，首次按 20 猜测，再按实际区间校正。
const defaultSliceSize = 20

type galleryCacheKey struct {
	scope accessScope
	ref   GalleryRef
}

type imageCacheKey struct {
	gallery galleryCacheKey
	page    int
}

// ImageLocator 持有图片定位状态；所有状态按上游身份、站点和完整图集定位信息隔离。
// 图片地址与换源令牌来自同一页，作为一个结果一起缓存和失效。
type ImageLocator struct {
	client     *Client
	pageTokens *expirable.LRU[imageCacheKey, string]
	sliceSizes *expirable.LRU[galleryCacheKey, int]
	showKeys   *expirable.LRU[galleryCacheKey, string]
	images     *expirable.LRU[imageCacheKey, imagePage]
	slices     singleflight.Group
}

func NewImageLocator(client *Client) *ImageLocator {
	return &ImageLocator{
		client:     client,
		pageTokens: expirable.NewLRU[imageCacheKey, string](20000, nil, 30*time.Minute),
		sliceSizes: expirable.NewLRU[galleryCacheKey, int](200, nil, 30*time.Minute),
		showKeys:   expirable.NewLRU[galleryCacheKey, string](200, nil, 30*time.Minute),
		images:     expirable.NewLRU[imageCacheKey, imagePage](5000, nil, 20*time.Minute),
	}
}

func (l *ImageLocator) Resolve(ctx context.Context, rc RequestContext, ref GalleryRef, page int) (string, error) {
	galleryKey := galleryCacheKey{scope: rc.scope(), ref: ref}
	key := imageCacheKey{gallery: galleryKey, page: page}
	if cached, ok := l.images.Get(key); ok {
		return cached.ImageURL, nil
	}
	pageToken, err := l.ensurePageToken(ctx, rc, ref, page)
	if err != nil {
		return "", err
	}

	if showKey, ok := l.showKeys.Get(galleryKey); ok {
		image, err := l.client.ShowImage(ctx, rc, ref, page, pageToken, showKey)
		if err == nil {
			l.rememberImage(key, image)
			return image.ImageURL, nil
		}
		if !errors.Is(err, errShowKeyExpired) {
			return "", err
		}
		l.showKeys.Remove(galleryKey)
	}

	image, err := l.client.FetchImagePage(ctx, rc, ref, page, pageToken, "")
	if err != nil {
		return "", err
	}
	l.rememberImage(key, image)
	return image.ImageURL, nil
}

// Refresh 淘汰已失败的地址，从该图片页重新定位；有该页的 nl 令牌时请求换源。
func (l *ImageLocator) Refresh(ctx context.Context, rc RequestContext, ref GalleryRef, page int) (string, error) {
	key := imageCacheKey{gallery: galleryCacheKey{scope: rc.scope(), ref: ref}, page: page}
	previous, _ := l.images.Get(key)
	l.images.Remove(key)
	pageToken, err := l.ensurePageToken(ctx, rc, ref, page)
	if err != nil {
		return "", err
	}
	image, err := l.client.FetchImagePage(ctx, rc, ref, page, pageToken, previous.ReloadToken)
	if err != nil {
		return "", err
	}
	// showpage 可能只给图片地址。先从当前页补齐 nl，再换源，不能借用其他页的令牌。
	if previous.ReloadToken == "" && image.ReloadToken != "" {
		image, err = l.client.FetchImagePage(ctx, rc, ref, page, pageToken, image.ReloadToken)
		if err != nil {
			return "", err
		}
	}
	l.rememberImage(key, image)
	return image.ImageURL, nil
}

func (l *ImageLocator) rememberImage(key imageCacheKey, image imagePage) {
	l.images.Add(key, image)
	if image.ShowKey != "" {
		l.showKeys.Add(key.gallery, image.ShowKey)
	}
	if image.NextPage > 0 && image.NextToken != "" {
		l.pageTokens.Add(imageCacheKey{gallery: key.gallery, page: image.NextPage}, image.NextToken)
	}
}

func (l *ImageLocator) ensurePageToken(ctx context.Context, rc RequestContext, ref GalleryRef, page int) (string, error) {
	galleryKey := galleryCacheKey{scope: rc.scope(), ref: ref}
	if cached, ok := l.pageTokens.Get(imageCacheKey{gallery: galleryKey, page: page}); ok {
		return cached, nil
	}
	sliceSize := defaultSliceSize
	if cached, ok := l.sliceSizes.Get(galleryKey); ok {
		sliceSize = cached
	}
	for range 2 {
		result, err := l.GalleryPage(ctx, rc, ref, (page-1)/sliceSize)
		if err != nil {
			return "", err
		}
		// 当前请求直接使用返回值，LRU 淘汰不会影响本次已取得的令牌。
		if token := result.PageTokens[page]; token != "" {
			return token, nil
		}
		corrected := result.sliceSize()
		if corrected == 0 || corrected == sliceSize {
			break
		}
		sliceSize = corrected
	}
	return "", errUnavailable("没能取到第 %d 页的图片令牌", page)
}

// 最后一片可能不满，只有中间分片能用于确定账号的分片大小。
func (page gallerySlice) sliceSize() int {
	if page.RangeFrom > 0 && page.RangeTo >= page.RangeFrom && page.RangeTo < page.TotalPages {
		return page.RangeTo - page.RangeFrom + 1
	}
	return 0
}

// GalleryPage 让评论与取图共享同一身份下的详情请求，返回 HTML 及已解析的定位数据。
func (l *ImageLocator) GalleryPage(ctx context.Context, rc RequestContext, ref GalleryRef, slice int) (gallerySlice, error) {
	key := galleryCacheKey{scope: rc.scope(), ref: ref}
	flightKey := fmt.Sprintf("%s:%x:%d:%s:%d", key.scope.site, key.scope.credential, ref.GID, ref.Token, slice)
	result := l.slices.DoChan(flightKey, func() (any, error) {
		// 单个读者取消不影响其他等待者；实际请求仍受 Client 超时约束。
		page, err := l.client.FetchGallerySlice(context.WithoutCancel(ctx), rc, ref, slice)
		if err != nil {
			return gallerySlice{}, err
		}
		for number, token := range page.PageTokens {
			l.pageTokens.Add(imageCacheKey{gallery: key, page: number}, token)
		}
		if size := page.sliceSize(); size > 0 {
			l.sliceSizes.Add(key, size)
		}
		return page, nil
	})
	select {
	case <-ctx.Done():
		return gallerySlice{}, ctx.Err()
	case response := <-result:
		if response.Err != nil {
			return gallerySlice{}, response.Err
		}
		return response.Val.(gallerySlice), nil
	}
}
