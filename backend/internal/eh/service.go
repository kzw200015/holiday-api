package eh

import (
	"context"
	"regexp"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"golang.org/x/sync/errgroup"

	"myapi/internal/apperr"
	"myapi/internal/signing"
)

// Service 编排图集浏览、用户状态和图片代理用例，供 Handler 调用。
type Service struct {
	// 内嵌而不是当字段挂着：偏好、搜索历史、进度这些方法本来就是 Service 要对外提供的，
	// 名字也是照这个位置起的，提升上来正好，不必再写一层同名转发。
	*UserState

	client      *Client
	credentials *CredentialStore
	locator     *ImageLocator
	signer      *signing.AttachmentSigner

	// 元数据统一从前站匿名获取，按图集定位信息共享缓存；缩略图保留原始地址，组装响应时再签名。
	galleries *expirable.LRU[GalleryRef, galleryMetadata]
}

func NewService(userState *UserState, client *Client, credentials *CredentialStore,
	locator *ImageLocator, signer *signing.AttachmentSigner) *Service {
	return &Service{
		UserState:   userState,
		client:      client,
		credentials: credentials,
		locator:     locator,
		signer:      signer,
		galleries:   expirable.NewLRU[GalleryRef, galleryMetadata](500, nil, 10*time.Minute),
	}
}

// 凭据这三个是转发而不是像 UserState 那样内嵌：CredentialStore 的方法名是照它自己起的，
// 提升上来就成了 Service.Status / Service.Bind，在一个还管着搜索和取图的门面上没法读。
// 转发的这一层做的正是改名。

func (s *Service) CredentialStatus(ctx context.Context, userID int64) (CredentialStatus, error) {
	return s.credentials.Status(ctx, userID)
}

func (s *Service) BindCredential(ctx context.Context, userID int64, cookie Cookie) (CredentialStatus, error) {
	return s.credentials.Bind(ctx, userID, cookie)
}

func (s *Service) UnbindCredential(ctx context.Context, userID int64) (CredentialStatus, error) {
	return s.credentials.Unbind(ctx, userID)
}

// SearchQuery 是一次搜索的全部条件，同时也是搜索接口的请求体：
// 带结构的条件（分类是一组名字）编码进查询串就得两头各写一份拼拆规则，所以整条走 JSON。
type SearchQuery struct {
	Keyword    string   `json:"keyword"`
	Categories []string `json:"categories"`
	// 空串表示第一页。
	Cursor string `json:"cursor"`
	// 显式指定前站；空串或不传表示按账号权限选择站点。
	Site Site `json:"site"`
}

// 分页游标是 e 站给的一串数字，会被拼进上游地址。
var cursorPattern = regexp.MustCompile(`^\d*$`)

// 检查搜索条件并归一。分类名认不认得由 toCategoryFilter 判断，换算结果这里用不上，
// 真正拼 f_cats 是 Client 的事——两处调的是同一份规则，不会各判各的。
func (q SearchQuery) checked() (SearchQuery, error) {
	if len(q.Keyword) > 200 {
		return SearchQuery{}, apperr.New(apperr.InvalidArgument, "关键词太长了")
	}
	if _, err := toCategoryFilter(q.Categories); err != nil {
		return SearchQuery{}, err
	}
	if !cursorPattern.MatchString(q.Cursor) {
		return SearchQuery{}, apperr.New(apperr.InvalidArgument, "分页游标不合法")
	}
	// site 只认显式的 "e"，别的值一律当成没传，交给账号权限决定
	if q.Site != SiteE {
		q.Site = ""
	}
	return q, nil
}

// SearchGalleries 从列表页获取图集顺序和游标，再用 gdata 补全元数据。
func (s *Service) SearchGalleries(ctx context.Context, userID int64, search SearchQuery) (GalleryPage, error) {
	search, err := search.checked()
	if err != nil {
		return GalleryPage{}, err
	}

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
		var err error
		progress, err = s.progressOf(groupCtx, userID, ref)
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
	// 全都在缓存里就别走这一趟：翻回上一页、重进详情都会命中这里。
	if len(missing) == 0 {
		return loaded, nil
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
