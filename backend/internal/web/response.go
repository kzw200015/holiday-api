// Package web 放依赖 HTTP 的横切设施：统一响应契约、错误翻译、访问日志、静态资源。
// 分界是**依赖**而不是话题——不碰 net/http 的东西（密钥运算、解析）不该进来。
package web

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"myapi/internal/apperr"
)

// Response 是所有接口的统一响应体，与前端 src/types/apiResponse.ts 保持一致。
// 字段的声明顺序即 JSON 的序列化顺序：code、data、msg，改动会让锁了完整 JSON 的测试失败。
//
// 唯一的例外是两个图片接口（/api/eh/thumbnail 和 .../pages/{page}/image），它们直接返回二进制流。
type Response struct {
	Code int    `json:"code"`
	Data any    `json:"data"`
	Msg  string `json:"msg"`
}

// BadRequest 供 HTTP 入参校验使用，业务代码直接使用 apperr。
func BadRequest(format string, args ...any) *apperr.Error {
	return apperr.New(apperr.InvalidArgument, format, args...)
}

// Unauthorized 构造未登录（或令牌已过期）。
func Unauthorized(msg string) *apperr.Error {
	return apperr.New(apperr.Unauthenticated, "%s", msg)
}

// 失败种类到 HTTP 状态码的唯一映射。未登记的种类按未知故障处理，不能泄露文案。
func errorStatus(kind apperr.Kind) int {
	switch kind {
	case apperr.InvalidArgument:
		return http.StatusBadRequest
	case apperr.Unauthenticated:
		return http.StatusUnauthorized
	case apperr.PermissionDenied:
		return http.StatusForbidden
	case apperr.NotFound:
		return http.StatusNotFound
	case apperr.ResourceExhausted:
		return http.StatusTooManyRequests
	case apperr.UpstreamFailure:
		return http.StatusBadGateway
	default:
		return http.StatusInternalServerError
	}
}

// Handler 是本项目的处理器形态：返回 error 就行，翻译成响应体的事统一交给 ServeHTTP。
//
// 用返回值而不是在每个处理器里各写一遍 http.Error，是为了让「什么错回什么状态码」
// 只有一处实现；也因此业务代码可以放心地把错误一路 return 上来。
type Handler func(http.ResponseWriter, *http.Request) error

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	err := h(w, r)
	if err == nil {
		return
	}

	// 客户端已经走了（阅读器里快速翻页时浏览器会成批中止图片请求），此时上游调用被连带取消，
	// 冒出来的错误既没人收也不该按故障记：写响应会失败，日志只留一条 debug
	if r.Context().Err() != nil {
		slog.Debug("客户端已断开，放弃响应", "method", r.Method, "path", r.URL.Path, "err", err)
		return
	}

	// 可预期的失败（配额用尽、Cookie 失效、签名过期）各有各的状态码，
	// 一律转成 500 的话，「额度没了」和「服务器崩了」在前端就分不出来。
	// 4xx 是调用方的问题，记 info 就够；5xx 说明上游或本站出了状况，升到 warn
	var apiErr *apperr.Error
	if errors.As(err, &apiErr) && errorStatus(apiErr.Kind) != http.StatusInternalServerError {
		status := errorStatus(apiErr.Kind)
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelWarn
		}
		attrs := []any{"method", r.Method, "path", r.URL.Path, "status", status, "msg", apiErr.Msg}
		if apiErr.Err != nil {
			attrs = append(attrs, "err", apiErr.Err)
		}
		slog.Log(r.Context(), level, "请求失败", attrs...)
		WriteJSON(w, status, Response{Code: status, Msg: apiErr.Msg})
		return
	}

	// 其余错误是没预料到的：SQL 报错、解析失败之类。原文只进日志，
	// 不回给客户端——那里面可能带着表名、文件路径这类不该外泄的细节
	slog.Error("未捕获异常", "method", r.Method, "path", r.URL.Path, "err", err)
	WriteJSON(w, http.StatusInternalServerError, internalError)
}

// 500 的固定响应体。Handler 和 Recover 两处共用，客户端看到的永远是这一句。
var internalError = Response{Code: http.StatusInternalServerError, Msg: "服务器内部错误"}

// ok 写一个成功响应。返回 error 只是为了让 Router 能写成 `return ok(...)`，它永远是 nil。
// 不导出：各模块一律经 Router 注册路由，写响应只剩这一个出口。
func ok(w http.ResponseWriter, data any) error {
	WriteJSON(w, http.StatusOK, Response{Code: 200, Data: data, Msg: "OK"})
	return nil
}

// WriteJSON 按给定状态码写出响应体。序列化失败时头已经发出去了，只能记日志。
func WriteJSON(w http.ResponseWriter, status int, body Response) {
	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("响应序列化失败", "err", err)
	}
}

// NotFound 兜住未匹配的 /api 路径，返回 JSON 格式的 404。
// 挂在静态资源之前，省得去磁盘找 public/api/... 这种不存在的文件。
func NotFound(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusNotFound, Response{Code: 404, Msg: "Not Found"})
}

// 请求体大小上限。这些接口收的都是几百字节的小 JSON，留 64 KB 已经很宽松，
// 不设上限的话一个长连接慢慢灌就能把内存吃掉。
const maxRequestBody = 64 << 10

// decodeJSON 解析请求体。字段级的校验由各模块的业务代码自己做，这里只管「是不是一段合法 JSON」。
func decodeJSON(r *http.Request, dst any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxRequestBody))
	// 多余字段直接报错而不是忽略：前端字段名拼错时，静默忽略的表现是「传了但没生效」
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return BadRequest("请求体格式错误").WithCause(err)
	}
	return nil
}
