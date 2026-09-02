// Package app 把各模块的路由拼成一个 http.Handler：中间件顺序、鉴权边界和静态资源兜底都在这里定。
package app

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"myapi/internal/auth"
	"myapi/internal/config"
	"myapi/internal/eh"
	"myapi/internal/holiday"
	"myapi/internal/web"
)

// NewRouter 组装整个应用。
//
// 鉴权绝不能挂在整个 /api 上：GET /api/holiday/is-holiday 有外部调用方，
// 两个图片接口靠地址签名认身份，挂全局会把这两类一起挡掉。
// 需要登录的接口在各自模块的子路由里挂 auth.Tokens.Require。
//
// 也没有 CSRF 中间件：跨站伪造之所以成立，是因为 Cookie 由浏览器自动带上；
// 身份改走 Authorization 头之后，跨站页面既读不到令牌也就冒名不了。
func NewRouter(cfg config.Config, holidayService *holiday.Service, authService *auth.Service,
	tokens *auth.Tokens, ehService *eh.Service) http.Handler {
	router := chi.NewRouter()

	router.Route("/api", func(api chi.Router) {
		// 访问日志只挂在 /api 下，静态资源不记，否则前端一次刷新就刷屏
		api.Use(web.RequestLogger)

		api.Mount("/holiday", holiday.Routes(holidayService))
		api.Mount("/auth", auth.Routes(authService, tokens))
		api.Mount("/eh", eh.Routes(ehService, tokens))

		// 其余 /api 路径统一返回 JSON 格式的 404，方法不匹配也归到这里：
		// /api 下的响应体一律是 ApiResponse，前端的拦截器按这个结构取 msg
		api.NotFound(web.NotFound)
		api.MethodNotAllowed(web.NotFound)
	})

	// 前端产物兜底：非 /api 路径找不到静态文件时保持无响应体的 404
	router.NotFound(web.Static(cfg.StaticDir).ServeHTTP)

	return router
}
