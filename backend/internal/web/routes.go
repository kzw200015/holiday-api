package web

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// Router 给 chi 补上本站固定的响应形态，注册一条路由时只剩「参数从哪来、调哪个用例」。
//
// 逐条手写的话，每条路由有十来行样板，真正的内容只有中间那一句；漏掉 `return ok(...)`
// 这类错误也只能靠人眼发现。
//
// 这里刻意不认识任何业务概念——登录者是谁、参数合不合规、返回的是哪个模块的类型，
// 都由注册处和业务各自决定。一旦把「取当前用户」之类写进签名，它就从「怎么注册一条路由」
// 变成了「怎么注册一条需要登录的路由」，只能服务于一种接口。
//
// 覆盖的是返回 Response 的接口。直接转发二进制流的（eh 的两条图片接口）响应形态不同，
// 硬塞进来就得让这里认识那边的附件类型，所以它们自己写 Handler。
//
// 嵌入 chi.Router，Use / Method 这些照常可用；Get 与 Post 会遮蔽 chi 的同名方法，
// 各模块注册路由一律经这里，不用原生那两个。Group 也一并遮蔽，交回给回调的就是包装过的
// Router——否则每开一组子路由都得记得再 Routes(r) 一次，忘了会悄悄退回 chi 原生的 Get/Post。
type Router struct{ chi.Router }

// Routes 把一个 chi 路由器包起来。
func Routes(router chi.Router) Router {
	return Router{router}
}

// Group 开一组共享中间件的子路由，交给回调的已经是包装过的 Router。
func (router Router) Group(fn func(Router)) Router {
	return Routes(router.Router.Group(func(r chi.Router) { fn(Routes(r)) }))
}

// Get 注册一个读接口。查询串、路径参数由 use 自己从请求里取。
func (router Router) Get[R any](pattern string, use func(*http.Request) (R, error)) {
	router.Method(http.MethodGet, pattern, Handler(func(w http.ResponseWriter, r *http.Request) error {
		result, err := use(r)
		if err != nil {
			return err
		}
		return ok(w, result)
	}))
}

// Post 注册一个带请求体的写接口，请求体先解成 B 再交给 use。
// 只回「成功与否」的用例把 R 写成 any、返回 nil 即可，响应体里的 data 就是 null。
func (router Router) Post[B, R any](pattern string, use func(context.Context, B) (R, error)) {
	router.Method(http.MethodPost, pattern, Handler(func(w http.ResponseWriter, r *http.Request) error {
		var body B
		if err := decodeJSON(r, &body); err != nil {
			return err
		}
		result, err := use(r.Context(), body)
		if err != nil {
			return err
		}
		return ok(w, result)
	}))
}

// Action 注册没有请求体的写接口，除了不解请求体，其余与 Post 一致。
//
// 不能拿 Post 配空结构体顶替：这几个调用压根不发请求体，解码会直接撞上 EOF。
// 两者的差别就只有这一条，所以结果也照样交回来——「清空」之后回一份清空了的列表，
// 比让前端自己拼一个空列表更少出错。只关心成败的用例把 R 写成 any、返回 nil 即可。
func (router Router) Action[R any](pattern string, use func(context.Context) (R, error)) {
	router.Method(http.MethodPost, pattern, Handler(func(w http.ResponseWriter, r *http.Request) error {
		result, err := use(r.Context())
		if err != nil {
			return err
		}
		return ok(w, result)
	}))
}
