package auth

import (
	"context"
	"net/http"
	"regexp"

	"github.com/go-chi/chi/v5"

	"myapi/internal/store"
	"myapi/internal/web"
)

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
	switch {
	case len(c.Password) < 8:
		return web.BadRequest("密码至少 8 位")
	case len(c.Password) > 128:
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

// Routes 挂在 /api/auth 下。
//
// 这里不返回 e 站的绑定状态：那是 eh 模块的事，放在 GET /api/eh/credential，
// 免得两个模块的类型互相缠住。
func Routes(service *Service, tokens *Tokens) http.Handler {
	router := chi.NewRouter()

	// 注册和登录的成功响应长得一模一样，读入参、签令牌这两段只写一次
	authenticate := func(w http.ResponseWriter, r *http.Request,
		verify func(ctx context.Context, username, password string) (store.User, error)) error {
		var body credentials
		if err := web.DecodeJSON(r, &body); err != nil {
			return err
		}
		if err := body.validate(); err != nil {
			return err
		}

		user, err := verify(r.Context(), body.Username, body.Password)
		if err != nil {
			return err
		}
		token, err := tokens.Issue(user.ID)
		if err != nil {
			return err
		}
		return web.OK(w, authenticated{Token: token, User: toCurrentUser(user)})
	}

	// POST /api/auth/register，注册成功即登录。用户名被占用或站点关闭注册时返回 400
	router.Method(http.MethodPost, "/register", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		return authenticate(w, r, service.Register)
	}))

	// POST /api/auth/login，成功后下发令牌
	router.Method(http.MethodPost, "/login", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		return authenticate(w, r, service.Login)
	}))

	// GET /api/auth/me，返回当前登录者，未登录或账号已被删都返回 data 为 null 的 200。
	// 刻意不回 401：前端的响应拦截器遇到 401 会跳登录页，而登录页自己也要问「我是谁」
	router.Method(http.MethodGet, "/me", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		userID := tokens.Read(r)
		if userID == 0 {
			return web.OK(w, nil)
		}
		user, err := service.FindByID(r.Context(), userID)
		if err != nil {
			return err
		}
		if user == nil {
			return web.OK(w, nil)
		}
		return web.OK(w, toCurrentUser(*user))
	}))

	return router
}

func toCurrentUser(user store.User) currentUser {
	return currentUser{ID: user.ID, Username: user.Username}
}
