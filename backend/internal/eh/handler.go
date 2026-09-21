package eh

import (
	"context"
	"net/http"
	"strconv"

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

// Routes 挂在 /api/eh 下，本模块的接口全在这一张表里，处理函数按主题分在各个 handler_*.go。
//
// 两组的区别是认人的方式：图片靠地址签名，其余靠登录令牌。新接口默认进第二组；
// 放错了组，TestRoutesRequireLogin 会报出来。
func (h *Handler) Routes() http.Handler {
	router := web.Routes(chi.NewRouter())

	// <img> 发的请求带不了 Authorization 头，这两条改由地址里的签名认人，直接回图片流。
	// 一次阅读就是几十个请求，访问日志统一降到 debug
	router.Group(func(r web.Router) {
		r.Use(web.Quiet)
		r.Method(http.MethodGet, "/galleries/{gid}/{token}/pages/{page}/image", web.Handler(h.galleryImage))
		r.Method(http.MethodGet, "/thumbnail", web.Handler(h.thumbnail))
	})

	router.Group(func(r web.Router) {
		r.Use(h.tokens.Require)

		// 账号数据：读一次、之后前端说了算，写入一律整份 PUT
		r.Get("/preferences", h.preferences)
		r.Put("/preferences", h.savePreferences)
		r.Get("/search-history", h.searchHistory)
		r.Put("/search-history", h.saveSearchHistory)

		// e 站凭据
		r.Get("/credential", h.credentialStatus)
		r.Post("/credential", h.bindCredential)
		r.PostNoBody("/credential/unbind", h.unbindCredential)

		// 图集
		r.Post("/galleries/search", h.searchGalleries)
		r.Get("/galleries/{gid}/{token}", h.galleryDetail)
		r.Get("/galleries/{gid}/{token}/comments", h.galleryComments)

		// 阅读进度与历史
		r.Post("/progress", h.saveProgress)
		r.Get("/history", h.readingHistory)
		r.Post("/history/remove", h.removeReadingHistory)
		r.PostNoBody("/history/clear", h.clearReadingHistory)
	})

	return router
}

// credentialStatus 返回绑定状态，不含明文 Cookie。
func (h *Handler) credentialStatus(r *http.Request) (CredentialStatus, error) {
	return h.service.CredentialStatus(r.Context(), auth.UserID(r.Context()))
}

// bindCredential 绑定前先拿这组 Cookie 实际请求一次，无效直接 400。
func (h *Handler) bindCredential(ctx context.Context, cookie Cookie) (CredentialStatus, error) {
	return h.service.BindCredential(ctx, auth.UserID(ctx), cookie)
}

// unbindCredential 解绑后退回匿名浏览前站。
func (h *Handler) unbindCredential(ctx context.Context) (CredentialStatus, error) {
	return h.service.UnbindCredential(ctx, auth.UserID(ctx))
}

// searchGalleries 游标式分页。这是一次读取，
// 走 POST 只是因为条件里有分类数组，整条放在请求体里比编码进查询串省事。
func (h *Handler) searchGalleries(ctx context.Context, search SearchQuery) (GalleryPage, error) {
	return h.service.SearchGalleries(ctx, auth.UserID(ctx), search)
}

// galleryDetail 返回元数据、阅读进度，外加这本图集的大图地址模板。
func (h *Handler) galleryDetail(r *http.Request) (GalleryDetailResult, error) {
	ref, err := galleryRefOf(r)
	if err != nil {
		return GalleryDetailResult{}, err
	}
	return h.service.GalleryDetailOf(r.Context(), auth.UserID(r.Context()), ref)
}

// galleryComments 单独一次请求，不拖慢详情页首屏。
func (h *Handler) galleryComments(r *http.Request) ([]GalleryComment, error) {
	ref, err := galleryRefOf(r)
	if err != nil {
		return nil, err
	}
	return h.service.GalleryComments(r.Context(), auth.UserID(r.Context()), ref)
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
