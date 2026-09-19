package eh

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"myapi/internal/auth"
	"myapi/internal/web"
)

// Handler 负责 HTTP 与鉴权；取图、搜索等业务只经 Service 门面调用。
//
// 这里只做「把请求里的文本变成入参」：取查询串、转数字、解 JSON。
// 值域和格式规则（页码为正、令牌长什么样、关键词多长）都在业务那边，
// 否则同一条规则会在两层各写一份，改的时候只改到一处。
type Handler struct {
	service *Service
	tokens  *auth.Tokens
}

func NewHandler(service *Service, tokens *auth.Tokens) *Handler {
	return &Handler{service: service, tokens: tokens}
}

// Routes 挂在 /api/eh 下：图片使用签名鉴权，其余接口使用登录令牌。
func (h *Handler) Routes() http.Handler {
	router := web.Routes(chi.NewRouter())

	// 浏览器的 img 请求不能携带 Authorization 头，改用签名地址，直接返回图片流。
	router.Group(func(r web.Router) {
		h.imageRoutes(r)
	})

	router.Group(func(r web.Router) {
		r.Use(h.tokens.Require)
		h.authedRoutes(r)
	})

	return router
}

func (h *Handler) authedRoutes(router web.Router) {
	h.preferenceRoutes(router)
	h.historyRoutes(router)

	// GET /api/eh/credential，返回绑定状态，不含明文 Cookie
	router.Get("/credential", func(r *http.Request) (CredentialStatus, error) {
		return h.service.CredentialStatus(r.Context(), auth.UserID(r.Context()))
	})

	// POST /api/eh/credential，绑定前先拿这组 Cookie 实际请求一次，无效直接 400
	router.Post("/credential", func(ctx context.Context, cookie Cookie) (CredentialStatus, error) {
		return h.service.BindCredential(ctx, auth.UserID(ctx), cookie)
	})

	// POST /api/eh/credential/unbind，解绑后退回匿名浏览前站
	router.Action("/credential/unbind", func(ctx context.Context) (CredentialStatus, error) {
		return h.service.UnbindCredential(ctx, auth.UserID(ctx))
	})

	// GET /api/eh/galleries?keyword=&categories=&cursor=&site=，游标式分页
	router.Get("/galleries", func(r *http.Request) (GalleryPage, error) {
		return h.service.SearchGalleries(r.Context(), auth.UserID(r.Context()), searchQueryOf(r))
	})

	// GET /api/eh/galleries/{gid}/{token}，元数据、阅读进度，外加这本图集的大图地址模板
	router.Get("/galleries/{gid}/{token}", func(r *http.Request) (GalleryDetailResult, error) {
		ref, err := galleryRefOf(r)
		if err != nil {
			return GalleryDetailResult{}, err
		}
		return h.service.GalleryDetailOf(r.Context(), auth.UserID(r.Context()), ref)
	})

	// GET /api/eh/galleries/{gid}/{token}/comments，单独一次请求，不拖慢详情页首屏
	router.Get("/galleries/{gid}/{token}/comments", func(r *http.Request) ([]GalleryComment, error) {
		ref, err := galleryRefOf(r)
		if err != nil {
			return nil, err
		}
		return h.service.GalleryComments(r.Context(), auth.UserID(r.Context()), ref)
	})

	// POST /api/eh/progress，记下读到第几页
	router.Post("/progress", func(ctx context.Context, body ReadingPosition) (any, error) {
		return nil, h.service.SaveProgress(ctx, auth.UserID(ctx), body)
	})
}

// 搜索参数。分类是名字的逗号列表，这里只负责拆开；认不认得这些名字由业务判断。
func searchQueryOf(r *http.Request) SearchQuery {
	query := r.URL.Query()

	var categories []string
	for name := range strings.SplitSeq(query.Get("categories"), ",") {
		if name != "" {
			categories = append(categories, name)
		}
	}
	return SearchQuery{
		Keyword:    query.Get("keyword"),
		Categories: categories,
		Cursor:     query.Get("cursor"),
		Site:       Site(query.Get("site")),
	}
}

// 路径上的 gid 与 token。解析失败显式归零——溢出时 ParseInt 回的是 MaxInt64 而不是 0——
// 正好撞进 checkGID 那条规则，文案由业务统一给，这儿不再自己报一遍。
func galleryRefOf(r *http.Request) (GalleryRef, error) {
	gid, err := strconv.ParseInt(chi.URLParam(r, "gid"), 10, 64)
	if err != nil {
		gid = 0
	}
	return newGalleryRef(gid, chi.URLParam(r, "token"))
}
