package eh

import (
	"context"
	"errors"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"

	"myapi/internal/eh/store"
	"myapi/internal/signing"
)

// Service 编排图集浏览、用户状态和图片代理用例，供 Handler 调用。
type Service struct {
	queries     *store.Queries
	client      *Client
	credentials *CredentialStore
	locator     *ImageLocator
	signer      *signing.AttachmentSigner

	// 元数据统一从前站匿名获取，按图集定位信息共享缓存；缩略图保留原始地址，组装响应时再签名。
	galleries *expirable.LRU[GalleryRef, galleryMetadata]
}

func NewService(queries *store.Queries, client *Client, credentials *CredentialStore,
	locator *ImageLocator, signer *signing.AttachmentSigner) *Service {
	return &Service{
		queries:     queries,
		client:      client,
		credentials: credentials,
		locator:     locator,
		signer:      signer,
		galleries:   expirable.NewLRU[GalleryRef, galleryMetadata](500, nil, 10*time.Minute),
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
	Keyword    string
	Categories []string
	Cursor     string
	// 显式指定前站；空串表示按账号权限选择站点。
	Site Site
}

// SearchGalleries 从列表页获取图集顺序和游标，再用 gdata 补全元数据。
func (s *Service) SearchGalleries(ctx context.Context, userID int64, search SearchQuery) (GalleryPage, error) {
	rc, err := s.credentials.RequestContext(ctx, userID, search.Site)
	if err != nil {
		return GalleryPage{}, err
	}

	result, err := s.client.Search(ctx, rc, search)
	if err != nil {
		return GalleryPage{}, err
	}
	refs := result.Refs
	galleries, err := s.loadGalleries(ctx, refs)
	if err != nil {
		return GalleryPage{}, err
	}

	items := make([]GalleryCard, 0, len(galleries))
	for _, ref := range refs {
		if gallery, ok := galleries[ref]; ok {
			items = append(items, s.galleryCard(gallery))
		}
	}
	return GalleryPage{Items: items, NextCursor: result.NextCursor}, nil
}

// GalleryDetailOf 取图集详情。只打一次 gdata，评论另有接口懒加载。
// 顺带签发这本图集的大图地址模板，阅读时前端只替换页码，不必每页再问一次。
func (s *Service) GalleryDetailOf(ctx context.Context, userID int64, ref GalleryRef) (GalleryDetailResult, error) {
	var gallery galleryMetadata
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
		loaded, ok := galleries[ref]
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
		Gallery:          s.galleryDetail(gallery),
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
	return parseGalleryComments(page.HTML)
}

// SaveProgress 记下读到第几页。同一个图集只留一条，重复上报就覆盖。
func (s *Service) SaveProgress(ctx context.Context, userID int64, ref GalleryRef, page int32) error {
	return s.queries.UpsertReadingProgress(ctx, store.UpsertReadingProgressParams{
		UserID: userID, Gid: ref.GID, Token: ref.Token, Page: page,
	})
}

// 本次结果独立于 LRU 保存；并发淘汰不影响已经取得的元数据。
func (s *Service) loadGalleries(ctx context.Context, refs []GalleryRef) (map[GalleryRef]galleryMetadata, error) {
	loaded := make(map[GalleryRef]galleryMetadata, len(refs))
	missing := make([]GalleryRef, 0, len(refs))
	for _, ref := range refs {
		if gallery, ok := s.galleries.Get(ref); ok {
			loaded[ref] = gallery
		} else {
			missing = append(missing, ref)
		}
	}

	galleries, err := s.client.FetchMetadata(ctx, missing)
	if err != nil {
		return nil, err
	}
	for ref, gallery := range galleries {
		loaded[ref] = gallery
		s.galleries.Add(ref, gallery)
	}
	return loaded, nil
}
