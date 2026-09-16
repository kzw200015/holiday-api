package eh

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"myapi/internal/auth"
	"myapi/internal/web"
)

// Handler 负责 HTTP 与鉴权；取图、搜索等业务只经 Service 门面调用。
type Handler struct {
	service *Service
	tokens  *auth.Tokens
}

func NewHandler(service *Service, tokens *auth.Tokens) *Handler {
	return &Handler{service: service, tokens: tokens}
}

// token 固定 10 位十六进制。它和 gid 都会被拼进上游地址，不校验就等于把用户输入直接发给 e 站。
var tokenPattern = regexp.MustCompile(`^[0-9a-f]{10}$`)

// 分页游标是 e 站给的一串数字，同样会进上游地址。
var cursorPattern = regexp.MustCompile(`^\d*$`)

// Routes 挂在 /api/eh 下：图片使用签名鉴权，其余接口使用登录令牌。
func (h *Handler) Routes() http.Handler {
	router := chi.NewRouter()

	// 浏览器的 img 请求不能携带 Authorization 头，改用签名地址，直接返回图片流。
	router.Group(func(r chi.Router) {
		h.imageRoutes(r)
	})

	router.Group(func(r chi.Router) {
		r.Use(h.tokens.Require)
		h.authedRoutes(r)
	})

	return router
}

func (h *Handler) authedRoutes(router chi.Router) {
	h.preferenceRoutes(router)
	h.historyRoutes(router)

	// GET /api/eh/credential，返回绑定状态，不含明文 Cookie
	router.Method(http.MethodGet, "/credential", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		status, err := h.service.CredentialStatus(r.Context(), auth.UserID(r.Context()))
		if err != nil {
			return err
		}
		return web.OK(w, status)
	}))

	// POST /api/eh/credential，绑定前先拿这组 Cookie 实际请求一次，无效直接 400
	router.Method(http.MethodPost, "/credential", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var cookie Cookie
		if err := web.DecodeJSON(r, &cookie); err != nil {
			return err
		}
		if err := cookie.validate(); err != nil {
			return err
		}
		status, err := h.service.BindCredential(r.Context(), auth.UserID(r.Context()), cookie)
		if err != nil {
			return err
		}
		return web.OK(w, status)
	}))

	// POST /api/eh/credential/unbind，解绑后退回匿名浏览前站
	router.Method(http.MethodPost, "/credential/unbind", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := h.service.UnbindCredential(r.Context(), auth.UserID(r.Context())); err != nil {
			return err
		}
		return web.OK(w, nil)
	}))

	// GET /api/eh/galleries?keyword=&categories=&cursor=&site=，游标式分页
	router.Method(http.MethodGet, "/galleries", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		search, err := parseSearchQuery(r)
		if err != nil {
			return err
		}
		page, err := h.service.SearchGalleries(r.Context(), auth.UserID(r.Context()), search)
		if err != nil {
			return err
		}
		return web.OK(w, page)
	}))

	// GET /api/eh/galleries/{gid}/{token}，元数据、阅读进度，外加这本图集的大图地址模板
	router.Method(http.MethodGet, "/galleries/{gid}/{token}", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		ref, err := parseGalleryRef(r)
		if err != nil {
			return err
		}
		detail, err := h.service.GalleryDetailOf(r.Context(), auth.UserID(r.Context()), ref)
		if err != nil {
			return err
		}
		return web.OK(w, detail)
	}))

	// GET /api/eh/galleries/{gid}/{token}/comments，单独一次请求，不拖慢详情页首屏
	router.Method(http.MethodGet, "/galleries/{gid}/{token}/comments", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		ref, err := parseGalleryRef(r)
		if err != nil {
			return err
		}
		comments, err := h.service.GalleryComments(r.Context(), auth.UserID(r.Context()), ref)
		if err != nil {
			return err
		}
		return web.OK(w, comments)
	}))

	// POST /api/eh/progress，记下读到第几页
	router.Method(http.MethodPost, "/progress", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var body struct {
			GID   int64  `json:"gid"`
			Token string `json:"token"`
			Page  int32  `json:"page"`
		}
		if err := web.DecodeJSON(r, &body); err != nil {
			return err
		}
		ref, err := newGalleryRef(body.GID, body.Token)
		if err != nil {
			return err
		}
		if err := checkPage(int(body.Page)); err != nil {
			return err
		}
		if err := h.service.SaveProgress(r.Context(), auth.UserID(r.Context()), ref, body.Page); err != nil {
			return err
		}
		return web.OK(w, nil)
	}))
}

// 搜索参数。分类用名字的逗号列表传，位掩码的换算封在 category.go 里：
// f_cats 传的是「排除哪些」，这个方向不该泄露到接口和前端。
func parseSearchQuery(r *http.Request) (SearchQuery, error) {
	query := r.URL.Query()

	keyword := query.Get("keyword")
	if len(keyword) > 200 {
		return SearchQuery{}, web.BadRequest("关键词太长了")
	}

	var categories []string
	for name := range strings.SplitSeq(query.Get("categories"), ",") {
		if name != "" {
			categories = append(categories, name)
		}
	}
	filter, err := toCategoryFilter(categories)
	if err != nil {
		return SearchQuery{}, err
	}

	cursor := query.Get("cursor")
	if !cursorPattern.MatchString(cursor) {
		return SearchQuery{}, web.BadRequest("分页游标不合法")
	}

	// site 只认显式的 "e"，别的值一律当成没传
	site := Site("")
	if query.Get("site") == string(SiteE) {
		site = SiteE
	}
	return SearchQuery{Keyword: keyword, CategoryFilter: filter, Cursor: cursor, Site: site}, nil
}

func parseGalleryRef(r *http.Request) (GalleryRef, error) {
	gid, err := strconv.ParseInt(chi.URLParam(r, "gid"), 10, 64)
	if err != nil {
		return GalleryRef{}, web.BadRequest("图集编号不合法")
	}
	return newGalleryRef(gid, chi.URLParam(r, "token"))
}

// 页码必须是正整数。URL 参数和 JSON 字段两条入口共用 checkPage 这一份规则和文案——
// 解析失败得到 0，正好落进同一个判断。
func parsePage(value string) (int, error) {
	page, _ := strconv.Atoi(value)
	return page, checkPage(page)
}

func checkPage(page int) error {
	if page <= 0 {
		return web.BadRequest("页码不合法")
	}
	return nil
}

func newGalleryRef(gid int64, token string) (GalleryRef, error) {
	if gid <= 0 {
		return GalleryRef{}, web.BadRequest("图集编号不合法")
	}
	if !tokenPattern.MatchString(token) {
		return GalleryRef{}, web.BadRequest("图集令牌不合法")
	}
	return GalleryRef{GID: gid, Token: token}, nil
}
