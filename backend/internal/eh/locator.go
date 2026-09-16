package eh

import (
	"context"
	"fmt"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"golang.org/x/sync/singleflight"
)

// 详情页默认每片 20 个缩略图。登录用户可以改成 40/50，所以只作为首次猜测。
const defaultSliceSize = 20

// ImageLocator 定位每页图片地址，并缓存图片令牌、分片大小及解析结果。
// 首次从详情页和 /s/ 页取得令牌、showkey，后续通过 showpage 获取图片及下一页令牌。
type ImageLocator struct {
	client *Client

	pageTokens  *expirable.LRU[string, string]
	sliceSizes  *expirable.LRU[string, int]
	showKeys    *expirable.LRU[string, string]
	reloadToken *expirable.LRU[string, string]
	imageURLs   *expirable.LRU[string, string]

	// 合并同一「站点 + 图集 + 分片」的并发请求，供可见页和预取页共用。
	slices singleflight.Group
}

func NewImageLocator(client *Client) *ImageLocator {
	return &ImageLocator{
		client:      client,
		pageTokens:  expirable.NewLRU[string, string](20000, nil, 30*time.Minute),
		sliceSizes:  expirable.NewLRU[string, int](200, nil, 30*time.Minute),
		showKeys:    expirable.NewLRU[string, string](200, nil, 30*time.Minute),
		reloadToken: expirable.NewLRU[string, string](200, nil, 30*time.Minute),
		imageURLs:   expirable.NewLRU[string, string](5000, nil, 20*time.Minute),
	}
}

// Resolve 优先通过 showpage 获取图片地址，showkey 缺失或失效时改用 /s/ 页面。
// reload 跳过地址缓存和 showpage，使用 nl 令牌请求换源。
func (l *ImageLocator) Resolve(ctx context.Context, rc RequestContext, ref GalleryRef, page int, reload bool) (string, error) {
	urlKey := pageKey(rc.Site, ref.GID, page)
	if reload {
		// 旧地址已经证明取不到了，先清掉：万一这次解析也失败，下次进来不该又拿到它
		l.imageURLs.Remove(urlKey)
	} else if cached, ok := l.imageURLs.Get(urlKey); ok {
		return cached, nil
	}

	pageToken, err := l.ensurePageToken(ctx, rc, ref, page)
	if err != nil {
		return "", err
	}

	key := metaKey(rc.Site, ref.GID)
	url := ""
	if showKey, ok := l.showKeys.Get(key); ok && !reload {
		if url, err = l.resolveViaAPI(ctx, rc, ref, page, pageToken, showKey); err != nil {
			return "", err
		}
		if url == "" {
			// showkey 过期了，清掉后回落去抓页面换一个新的
			l.showKeys.Remove(key)
		}
	}
	if url == "" {
		if url, err = l.resolveViaPage(ctx, rc, ref, page, pageToken, reload); err != nil {
			return "", err
		}
	}

	l.imageURLs.Add(urlKey, url)
	return url, nil
}

// AbsorbGalleryPage 收下一页详情 HTML 里顺带带来的每页令牌。
// 评论接口抓的就是详情首片，读完令牌等下点「开始阅读」就不用再抓一次。
func (l *ImageLocator) AbsorbGalleryPage(site Site, gid int64, page string) {
	parsed := parseGalleryPage(page)
	for number, token := range parsed.PageTokens {
		l.pageTokens.Add(pageKey(site, gid, number), token)
	}

	// 只有不是最后一片时区间长度才等于分片大小，最后一片通常是残缺的
	if parsed.RangeFrom > 0 && parsed.RangeTo < parsed.TotalPages {
		l.sliceSizes.Add(metaKey(site, gid), parsed.RangeTo-parsed.RangeFrom+1)
	}
}

// 走 showpage 接口。showkey 失效时返回空串，交给调用方换路子。
func (l *ImageLocator) resolveViaAPI(ctx context.Context, rc RequestContext, ref GalleryRef,
	page int, pageToken, showKey string) (string, error) {
	var response showPageResponse
	payload := map[string]any{
		"method": "showpage", "gid": ref.GID, "page": page, "imgkey": pageToken, "showkey": showKey,
	}
	if err := l.client.CallAPI(ctx, rc, payload, &response); err != nil {
		return "", err
	}
	if response.Error != "" {
		return "", nil
	}

	imageURL, nextPage, nextToken := parseShowPageFragment(response.I3)
	// 缓存下一页令牌，连续翻页时无需再请求详情页。
	if nextPage > 0 {
		l.pageTokens.Add(pageKey(rc.Site, ref.GID, nextPage), nextToken)
	}
	return imageURL, nil
}

// 抓 /s/ 页面。顺带把 showkey 和换源令牌记下来。
func (l *ImageLocator) resolveViaPage(ctx context.Context, rc RequestContext, ref GalleryRef,
	page int, pageToken string, reload bool) (string, error) {
	key := metaKey(rc.Site, ref.GID)

	// nl 参数让 e 站换一台图床节点，用于原节点失效时重取
	suffix := ""
	if reload {
		if token, ok := l.reloadToken.Get(key); ok {
			suffix = "?nl=" + token
		}
	}

	body, err := l.client.FetchPage(ctx, rc, fmt.Sprintf("/s/%s/%d-%d%s", pageToken, ref.GID, page, suffix))
	if err != nil {
		return "", err
	}

	parsed := parseImagePage(body)
	if parsed.ShowKey != "" {
		l.showKeys.Add(key, parsed.ShowKey)
	}
	if parsed.ReloadToken != "" {
		l.reloadToken.Add(key, parsed.ReloadToken)
	}
	if parsed.ImageURL == "" {
		return "", errUnavailable("第 %d 页没解析出图片地址，e 站版面可能改了", page)
	}
	return parsed.ImageURL, nil
}

// 拿到某一页的图片令牌。
//
// 一页详情只列 20 个（登录用户能调到 40/50），所以按需抓包含目标页的那一片。
// 分片大小先按默认值猜，抓回来后用 Showing 那行给出的真实区间校正，最多再抓一次。
func (l *ImageLocator) ensurePageToken(ctx context.Context, rc RequestContext, ref GalleryRef, page int) (string, error) {
	if cached, ok := l.pageTokens.Get(pageKey(rc.Site, ref.GID, page)); ok {
		return cached, nil
	}

	key := metaKey(rc.Site, ref.GID)
	sliceSize := defaultSliceSize
	if cached, ok := l.sliceSizes.Get(key); ok {
		sliceSize = cached
	}

	for range 2 {
		if _, err := l.GalleryPage(ctx, rc, ref, (page-1)/sliceSize); err != nil {
			return "", err
		}
		if found, ok := l.pageTokens.Get(pageKey(rc.Site, ref.GID, page)); ok {
			return found, nil
		}
		corrected, ok := l.sliceSizes.Get(key)
		if !ok || corrected == sliceSize {
			break
		}
		sliceSize = corrected
	}

	return "", errUnavailable("没能取到第 %d 页的图片令牌", page)
}

// GalleryPage 抓详情页的某一片，把里面的每页令牌收进缓存，并把 HTML 交给调用方。
// 同一片的并发请求合并成一次上游调用——评论接口要的正是首片，跟取图链路是同一个页面。
func (l *ImageLocator) GalleryPage(ctx context.Context, rc RequestContext, ref GalleryRef, slice int) (string, error) {
	result := l.slices.DoChan(fmt.Sprintf("%s:%d", metaKey(rc.Site, ref.GID), slice), func() (any, error) {
		// 单个读者取消不能中断共享请求；上游超时由 Client 控制。
		detached := context.WithoutCancel(ctx)
		// ?p= 是 0 基的，?p=0 就是第一片
		body, err := l.client.FetchPage(detached, rc, fmt.Sprintf("/g/%d/%s/?p=%d", ref.GID, ref.Token, slice))
		if err != nil {
			return "", err
		}
		l.AbsorbGalleryPage(rc.Site, ref.GID, body)
		return body, nil
	})
	// 共享请求继续为其他读者服务；当前读者取消后不用等到上游超时才释放处理器。
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case page := <-result:
		if page.Err != nil {
			return "", page.Err
		}
		return page.Val.(string), nil
	}
}

// 按站点区分的图集级缓存键：分片大小、showkey、换源令牌共用它。
func metaKey(site Site, gid int64) string {
	return fmt.Sprintf("%s:%d", site, gid)
}

func pageKey(site Site, gid int64, page int) string {
	return fmt.Sprintf("%s:%d:%d", site, gid, page)
}
