package web

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

type ctxKey int

const accessLogKey ctxKey = iota

// 访问日志的可变状态。请求量特别大的路由（目前是两个图片接口）自己调 Quiet 把级别降下来——
// 哪条路由吵是那条路由自己的事，通用中间件不该认识具体业务路径。
type accessLog struct{ quiet bool }

// Quiet 是中间件：罩住的路由，访问日志降到 debug。一屏缩略图加一页阅读就是几十个请求，
// 不降级的话别的日志会被冲没。
//
// 做成中间件而不是让处理器在函数体里调一句，是因为「这条路由很吵」是路由的静态属性——
// 挂在注册处才跟路由长在一起，日后加同类接口时漏写不了。
func Quiet(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if state, ok := r.Context().Value(accessLogKey).(*accessLog); ok {
			state.quiet = true
		}
		next.ServeHTTP(w, r)
	})
}

// RequestLogger 每个请求记一行访问日志：方法、路径、状态码、耗时。
// 只挂在 /api 下，静态资源请求不记，否则前端一次刷新就刷屏。
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		state := &accessLog{}
		wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		startedAt := time.Now()

		next.ServeHTTP(wrapped, r.WithContext(context.WithValue(r.Context(), accessLogKey, state)))

		level := slog.LevelInfo
		if state.quiet && wrapped.Status() < 400 {
			level = slog.LevelDebug
		}
		// 图片接口降到 debug 后通常是不输出的，先问一句就省掉下面那串参数的装箱
		if !slog.Default().Enabled(r.Context(), level) {
			return
		}
		slog.Log(r.Context(), level, "请求完成",
			"method", r.Method, "path", r.URL.Path,
			"status", wrapped.Status(), "durationMs", time.Since(startedAt).Milliseconds())
	})
}

// Static 提供前端构建产物，只命中真实存在的文件（目录取 index.html）。
//
// 前端是哈希路由，未知路径不需要重写到 index.html，找不到就保持**无响应体**的 404——
// 静态资源的兜底逻辑依赖这一点，别改成回 JSON。
func Static(root string) http.Handler {
	files := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Clean 掉 ../ 之后再拼，目录穿越在这里就断了
		urlPath := path.Clean("/" + r.URL.Path)
		name := filepath.Join(root, filepath.FromSlash(urlPath))

		info, err := os.Stat(name)
		if err == nil && info.IsDir() {
			info, err = os.Stat(filepath.Join(name, "index.html"))
		}
		if err != nil || info.IsDir() {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		// Vite 打出的 assets/ 文件名带内容 hash，可以永久缓存；其余文件（index.html 等）每次都重新取
		if strings.Contains(urlPath, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}
