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

// token 固定 10 位十六进制。它和 gid 都会被拼进上游地址，不校验就等于把用户输入直接发给 e 站。
var tokenPattern = regexp.MustCompile(`^[0-9a-f]{10}$`)

// 分页游标是 e 站给的一串数字，同样会进上游地址。
var cursorPattern = regexp.MustCompile(`^\d*$`)

// Routes 挂在 /api/eh 下，同时包含要登录和不要登录的两组路由。
//
// 两组分开写而不是在一处挑几条豁免，是为了让「哪些接口不需要登录」一眼可见：
// 混在一起的话，日后加接口时很容易顺手加到不设防的那一侧。
func Routes(service *Service, tokens *auth.Tokens) http.Handler {
	router := chi.NewRouter()

	// 不要求登录的两个图片接口。<img src> 是浏览器自己发的请求，带不了 Authorization 头，
	// 所以它们靠地址里的签名认身份，签名由 service 签发和校验。
	// 这两条也是统一 ApiResponse 契约的唯一例外，直接返回二进制流
	router.Group(func(r chi.Router) {
		imageRoutes(r, service)
	})

	// 其余接口一律要登录。鉴权挂在这里而不是整个 /api 上，
	// 因为 GET /api/holiday/is-holiday 有外部调用方，挂全局会把它一起挡掉
	router.Group(func(r chi.Router) {
		r.Use(tokens.Require)
		authedRoutes(r, service)
	})

	return router
}

func authedRoutes(router chi.Router, service *Service) {
	// GET /api/eh/credential，返回绑定状态，不含明文 Cookie
	router.Method(http.MethodGet, "/credential", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		status, err := service.CredentialStatus(r.Context(), auth.UserID(r.Context()))
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
		status, err := service.BindCredential(r.Context(), auth.UserID(r.Context()), cookie)
		if err != nil {
			return err
		}
		return web.OK(w, status)
	}))

	// POST /api/eh/credential/unbind，解绑后退回匿名浏览前站
	router.Method(http.MethodPost, "/credential/unbind", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := service.UnbindCredential(r.Context(), auth.UserID(r.Context())); err != nil {
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
		page, err := service.SearchGalleries(r.Context(), auth.UserID(r.Context()), search)
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
		detail, err := service.GalleryDetailOf(r.Context(), auth.UserID(r.Context()), ref)
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
		comments, err := service.GalleryComments(r.Context(), auth.UserID(r.Context()), ref)
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
		if err := service.SaveProgress(r.Context(), auth.UserID(r.Context()), ref, body.Page); err != nil {
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
