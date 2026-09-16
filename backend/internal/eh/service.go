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

// Service 是 e 站模块对外的门面：handler 只认这一个类型，模块内部的分工不外泄。
//
// 它自己负责编排——把上游调用、HTML 解析、元数据缓存和附件签名串成一次次用例；
// 另外两块状态各自成类：用户凭据见 CredentialStore，每页令牌与图片地址见 ImageLocator。
type Service struct {
	queries     *store.Queries
	client      *Client
	credentials *CredentialStore
	locator     *ImageLocator
	signer      *signing.AttachmentSigner

	// 键里不带站点：gdata 一律走前站（见 loadGalleries），同一个 gid 的元数据前后站完全一样。
	// 带上站点的话，有里站权限的用户和没有的用户看同一批图集要各打一次 gdata，缓存名额也白占一倍。
	//
	// 存的是上游的原始缩略图地址而不是签好名的代理地址：后者带有效期，
	// 烤进一份 TTL 与它无关的缓存等于要求「这里的 TTL 必须永远短于 ATTACHMENT_TTL」，
	// 那是一条没人写下来的约束。签名因此放到组装响应时才做，见 withThumbnail。
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

// ---------------------------------------------------------------------------
// 凭据。三个方法原样转交给 CredentialStore：让「eh 模块对外提供哪些用例」在一个类型上看全，
// handler 也就不必同时注入两个依赖
// ---------------------------------------------------------------------------

func (s *Service) CredentialStatus(ctx context.Context, userID int64) (CredentialStatus, error) {
	return s.credentials.Status(ctx, userID)
}

func (s *Service) BindCredential(ctx context.Context, userID int64, cookie Cookie) (CredentialStatus, error) {
	return s.credentials.Bind(ctx, userID, cookie)
}

func (s *Service) UnbindCredential(ctx context.Context, userID int64) error {
	return s.credentials.Unbind(ctx, userID)
}

// ---------------------------------------------------------------------------
// 浏览
// ---------------------------------------------------------------------------

// SearchQuery 是一次搜索的全部条件。
type SearchQuery struct {
	Keyword string
	// 已经换算好的 f_cats（见 category.go），-1 表示这次不加这个参数。
	CategoryFilter int
	Cursor         string
	// 显式指定前站，用于有里站权限但想看前站的场合；空串表示用当前账号能到的最好的那个。
	Site Site
}

// SearchGalleries 搜索图集。
//
// 列表页 HTML 只用来取图集序列和游标，标题标签这些一律走 gdata：
// 那边是结构化 JSON，比盯着会改版的 HTML 稳得多。
func (s *Service) SearchGalleries(ctx context.Context, userID int64, search SearchQuery) (GalleryPage, error) {
	rc, err := s.credentials.RequestContext(ctx, userID, search.Site)
	if err != nil {
		return GalleryPage{}, err
	}

	query := url.Values{}
	if search.Keyword != "" {
		// Encode 自己会做 UTF-8 百分号编码，中文关键词直接放就行
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
	for _, gallery := range galleries {
		items = append(items, s.withThumbnail(gallery).GalleryCard)
	}
	return GalleryPage{Items: items, NextCursor: nextCursor}, nil
}

// GalleryDetailOf 取图集详情。只打一次 gdata，评论另有接口懒加载。
// 顺带签发这本图集的大图地址模板，阅读时前端只替换页码，不必每页再问一次。
func (s *Service) GalleryDetailOf(ctx context.Context, userID int64, ref GalleryRef) (GalleryDetailResult, error) {
	var gallery GalleryDetail
	var progress *int32

	// 阅读进度只用到 userId 和 gid，跟元数据没有依赖关系，
	// 别让它排在那次跨境调用后面——连取凭据的那次查库也一起绕开
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
		if len(galleries) == 0 {
			return errGalleryMissing()
		}
		gallery = galleries[0]
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
	// 评论在详情页首片上，取图链路要的也是它——走 locator 就能共用那边的在途去重，
	// 顺带把首片的每页令牌也收了，等下点「开始阅读」不用再抓一次
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

// 批量补全元数据，命中缓存的跳过，剩下的按 25 一批打 gdata。
//
// 不收请求上下文：gdata 一律走前站——免登录、返回的封面也落在 ehgt.org 上，
// 不用把用户身份带过去，所以谁在看跟这里无关。
func (s *Service) loadGalleries(ctx context.Context, refs []GalleryRef) ([]GalleryDetail, error) {
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
		// 整批被拒（gidlist 格式不对、条数超限）时没有 gmetadata，不报出来的话表现是「搜索结果永远为空」
		if response.Error != "" {
			return nil, errUnavailable("e 站元数据接口拒绝了请求：%s", response.Error)
		}

		for _, entry := range response.Gmetadata {
			// 被删或转私有的图集单条会变成 { error }，跳过它，别让一条坏数据废掉整批
			if entry.Error != "" {
				continue
			}
			gallery := toGallery(entry)
			loaded[gallery.GID] = gallery
			s.galleries.Add(gallery.GID, gallery)
		}
	}

	found := make([]GalleryDetail, 0, len(refs))
	for _, ref := range refs {
		if gallery, ok := loaded[ref.GID]; ok {
			found = append(found, gallery)
		}
	}
	return found, nil
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
