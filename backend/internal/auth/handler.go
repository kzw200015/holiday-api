package auth

import (
	"context"
	"net/http"
	"regexp"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"myapi/internal/auth/store"
	"myapi/internal/web"
)

// Handler 持有 HTTP 用例需要的依赖，Service 不承担路由和令牌传递。
type Handler struct {
	service *Service
	tokens  *Tokens
}

func NewHandler(service *Service, tokens *Tokens) *Handler {
	return &Handler{service: service, tokens: tokens}
}

// 用户名限制成一眼能认的字符集，是因为它会出现在 URL 和日志里；
// 密码只卡长度，不强制复杂度——强制复杂度反而会逼出「Passw0rd!」这种可预测的密码。
var usernamePattern = regexp.MustCompile(`^[0-9A-Za-z_-]{3,32}$`)

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (c credentials) validate() error {
	if !usernamePattern.MatchString(c.Username) {
		return web.BadRequest("用户名只能是 3 到 32 位的字母、数字、下划线或连字符")
	}
	// 按字符数而不是字节数：文案里的「位」用户理解成字符，3 个汉字（9 字节）不该算够 8 位
	switch length := utf8.RuneCountInString(c.Password); {
	case length < 8:
		return web.BadRequest("密码至少 8 位")
	case length > 128:
		return web.BadRequest("密码最长 128 位")
	}
	return nil
}

// 能给前端看的两列。三个接口都经这里，既保证字段一致，
// 也是「passwordHash 绝不出现在响应体里」的唯一关口。
type currentUser struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

// 登录与注册的响应：令牌交给前端自己保管，之后每个请求放进 Authorization 头。
type authenticated struct {
	Token string      `json:"token"`
	User  currentUser `json:"user"`
}

// 登录页要先知道的站点设置。
type options struct {
	AllowRegistration bool `json:"allowRegistration"`
}

// Routes 挂在 /api/auth 下。
//
// 这里不返回 e 站的绑定状态：那是 eh 模块的事，放在 GET /api/eh/credential，
// 免得两个模块的类型互相缠住。
func (h *Handler) Routes() http.Handler {
	router := web.Routes(chi.NewRouter())

	// GET /api/auth/options，不用登录。登录页据此决定给不给注册入口，
	// 否则关了注册的站点上，用户要把表单填完提交了才知道注册不了
	router.Get("/options", func(*http.Request) (options, error) {
		return options{AllowRegistration: h.service.RegistrationOpen()}, nil
	})

	// POST /api/auth/register，注册成功即登录。用户名被占用或站点关闭注册时返回 400
	router.Post("/register", func(ctx context.Context, body credentials) (authenticated, error) {
		return h.authenticate(ctx, body, h.service.Register)
	})

	// POST /api/auth/login，成功后下发令牌
	router.Post("/login", func(ctx context.Context, body credentials) (authenticated, error) {
		return h.authenticate(ctx, body, h.service.Login)
	})

	// GET /api/auth/me，返回当前登录者，未登录或账号已被删都返回 data 为 null 的 200。
	// 刻意不回 401：前端的响应拦截器遇到 401 会跳登录页，而登录页自己也要问「我是谁」
	router.Get("/me", func(r *http.Request) (*currentUser, error) {
		userID := h.tokens.Read(r)
		if userID == 0 {
			return nil, nil
		}
		user, err := h.service.FindByID(r.Context(), userID)
		if err != nil || user == nil {
			return nil, err
		}
		current := toCurrentUser(*user)
		return &current, nil
	})

	return router
}

// 注册和登录的成功响应长得一模一样，校验入参、签令牌这两段只写一次。
func (h *Handler) authenticate(ctx context.Context, body credentials,
	verify func(ctx context.Context, username, password string) (store.User, error)) (authenticated, error) {
	if err := body.validate(); err != nil {
		return authenticated{}, err
	}

	user, err := verify(ctx, body.Username, body.Password)
	if err != nil {
		return authenticated{}, err
	}
	token, err := h.tokens.Issue(user.ID)
	if err != nil {
		return authenticated{}, err
	}
	return authenticated{Token: token, User: toCurrentUser(user)}, nil
}

func toCurrentUser(user store.User) currentUser {
	return currentUser{ID: user.ID, Username: user.Username}
}
