package eh

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"

	"myapi/internal/eh/store"
	"myapi/internal/signing"
)

// gdata 单次最多 25 条，这是 e 站定的。
const metadataBatchSize = 25

// Service 编排图集浏览、用户状态和图片代理用例，供 Handler 调用。
type Service struct {
	queries     *store.Queries
	client      *Client
	credentials *CredentialStore
	locator     *ImageLocator
	signer      *signing.AttachmentSigner

	// 元数据统一从前站匿名获取，按 gid 共享缓存；缩略图保留原始地址，组装响应时再签名。
	galleries *expirable.LRU[int64, GalleryDetail]
}

func NewService(queries *store.Queries, client *Client, credentials *CredentialStore,
	locator *ImageLocator, signer *signing.AttachmentSigner) *Service {
	return &Service{
		queries:     queries,
		client:      client,
		credentials: credentials,
		locator:     locator,
		signer:      signer,
		galleries:   expirable.NewLRU[int64, GalleryDetail](500, nil, 10*time.Minute),
	}
}

func (s *Service) CredentialStatus(ctx context.Context, userID int64) (CredentialStatus, error) {
	return s.credentials.Status(ctx, userID)
}

func (s *Service) BindCredential(ctx context.Context, userID int64, cookie Cookie) (CredentialStatus, error) {
	return s.credentials.Bind(ctx, userID, cookie)
}

func (s *Service) UnbindCredential(ctx context.Context, userID int64) error {
	return s.credentials.Unbind(ctx, userID)
}

// SearchQuery 是一次搜索的全部条件。
type SearchQuery struct {
	Keyword string
	// 已经换算好的 f_cats（见 category.go），-1 表示这次不加这个参数。
	CategoryFilter int
	Cursor         string
	// 显式指定前站；空串表示按账号权限选择站点。
	Site Site
}

// SearchGalleries 从列表页获取图集顺序和游标，再用 gdata 补全元数据。
func (s *Service) SearchGalleries(ctx context.Context, userID int64, search SearchQuery) (GalleryPage, error) {
	rc, err := s.credentials.RequestContext(ctx, userID, search.Site)
	if err != nil {
		return GalleryPage{}, err
	}

	query := url.Values{}
	if search.Keyword != "" {
		query.Set("f_search", search.Keyword)
	}
	if search.CategoryFilter >= 0 {
		query.Set("f_cats", strconv.Itoa(search.CategoryFilter))
	}
	if search.Cursor != "" {
		// 游标不携带筛选条件，翻页时 f_search 和 f_cats 必须一起重发
		query.Set("next", search.Cursor)
	}

	body, err := s.client.FetchPage(ctx, rc, "/?"+query.Encode())
	if err != nil {
		return GalleryPage{}, err
	}

	refs, nextCursor := parseGalleryList(body)
	galleries, err := s.loadGalleries(ctx, refs)
	if err != nil {
		return GalleryPage{}, err
	}

	items := make([]GalleryCard, 0, len(galleries))
	for _, ref := range refs {
		if gallery, ok := galleries[ref.GID]; ok {
			items = append(items, s.withThumbnail(gallery).GalleryCard)
		}
	}
	return GalleryPage{Items: items, NextCursor: nextCursor}, nil
}

// GalleryDetailOf 取图集详情。只打一次 gdata，评论另有接口懒加载。
// 顺带签发这本图集的大图地址模板，阅读时前端只替换页码，不必每页再问一次。
func (s *Service) GalleryDetailOf(ctx context.Context, userID int64, ref GalleryRef) (GalleryDetailResult, error) {
	var gallery GalleryDetail
	var progress *int32

	// 阅读进度与元数据互不依赖，并发读取。
	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		page, err := s.queries.GetReadingProgress(groupCtx, store.GetReadingProgressParams{UserID: userID, Gid: ref.GID})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		progress = &page
		return err
	})
	group.Go(func() error {
		galleries, err := s.loadGalleries(groupCtx, []GalleryRef{ref})
		if err != nil {
			return err
		}
		loaded, ok := galleries[ref.GID]
		if !ok {
			return errGalleryMissing()
		}
		gallery = loaded
		return nil
	})
	if err := group.Wait(); err != nil {
		return GalleryDetailResult{}, err
	}

	return GalleryDetailResult{
		Gallery:          s.withThumbnail(gallery),
		Progress:         progress,
		ImageURLTemplate: s.imageURLTemplate(userID, ref),
	}, nil
}

// GalleryComments 取评论。这是详情页 HTML 里唯一拿不到 JSON 替代的东西，所以单独一次请求。
func (s *Service) GalleryComments(ctx context.Context, userID int64, ref GalleryRef) ([]GalleryComment, error) {
	rc, err := s.credentials.RequestContext(ctx, userID, "")
	if err != nil {
		return nil, err
	}
	// 评论与取图共用详情首片的在途请求，并缓存其中的图片令牌。
	page, err := s.locator.GalleryPage(ctx, rc, ref, 0)
	if err != nil {
		return nil, err
	}
	return parseGalleryComments(page)
}

// SaveProgress 记下读到第几页。同一个图集只留一条，重复上报就覆盖。
func (s *Service) SaveProgress(ctx context.Context, userID int64, ref GalleryRef, page int32) error {
	return s.queries.UpsertReadingProgress(ctx, store.UpsertReadingProgressParams{
		UserID: userID, Gid: ref.GID, Token: ref.Token, Page: page,
	})
}

// 按 GID 返回可访问的图集元数据；未命中的部分每批最多 25 条，匿名请求前站 gdata。
func (s *Service) loadGalleries(ctx context.Context, refs []GalleryRef) (map[int64]GalleryDetail, error) {
	// 本次结果独立保存：后续批次或并发请求可能淘汰 LRU 条目，不能再靠回读缓存组装响应。
	loaded := make(map[int64]GalleryDetail, len(refs))
	var missing []GalleryRef
	for _, ref := range refs {
		if gallery, ok := s.galleries.Get(ref.GID); ok {
			loaded[ref.GID] = gallery
		} else {
			missing = append(missing, ref)
		}
	}

	for start := 0; start < len(missing); start += metadataBatchSize {
		chunk := missing[start:min(start+metadataBatchSize, len(missing))]
		list := make([][2]any, len(chunk))
		for i, ref := range chunk {
			list[i] = [2]any{ref.GID, ref.Token}
		}

		var response gdataResponse
		payload := map[string]any{"method": "gdata", "gidlist": list, "namespace": 1}
		if err := s.client.CallAPI(ctx, RequestContext{Site: SiteE}, payload, &response); err != nil {
			return nil, err
		}
		// 整批失败必须报错，不能伪装成空列表。
		if response.Error != "" {
			return nil, errUnavailable("e 站元数据接口拒绝了请求：%s", response.Error)
		}

		for _, entry := range response.Gmetadata {
			// 单条不可访问的图集不影响其余结果。
			if entry.Error != "" {
				continue
			}
			gallery := toGallery(entry)
			loaded[gallery.GID] = gallery
			s.galleries.Add(gallery.GID, gallery)
		}
	}

	return loaded, nil
}

// gdata 的一条记录 → 领域类型。Thumbnail 这里放的还是上游原始地址，见 withThumbnail。
func toGallery(entry gdataEntry) GalleryDetail {
	tags := make([]string, len(entry.Tags))
	for i, tag := range entry.Tags {
		tags[i] = decodeEntities(tag)
	}
	return GalleryDetail{
		GalleryCard: GalleryCard{
			GID:   int64(entry.GID),
			Token: entry.Token,
			// gdata 返回的标题是 HTML 转义过的，实测有 `Arcueid &amp; Ciel x Goblin`
			Title:     decodeEntities(entry.Title),
			TitleJpn:  decodeEntities(entry.TitleJpn),
			Category:  entry.Category,
			Thumbnail: entry.Thumb,
			Uploader:  entry.Uploader,
			PostedAt:  time.Unix(int64(entry.Posted), 0).UTC().Format(isoLayout),
			FileCount: int(entry.FileCount),
			Rating:    float64(entry.Rating),
			Tags:      tags,
		},
		FileSize:     int64(entry.FileSize),
		TorrentCount: int(entry.TorrentCount),
		Expunged:     entry.Expunged,
	}
}
