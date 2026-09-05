// Package web 放依赖 HTTP 的横切设施：统一响应契约、错误翻译、访问日志、静态资源。
// 分界是**依赖**而不是话题——不碰 net/http 的东西（密钥运算、解析）不该进来。
package web

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
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

// Error 是能直接回给客户端的失败：Status 决定 HTTP 状态码，Msg 原样进响应体的 msg 字段，
// 所以它要写成给人看的话。Err 挂原始错误，只进日志。
type Error struct {
	Status int
	Msg    string
	Err    error
}

func (e *Error) Error() string { return e.Msg }

func (e *Error) Unwrap() error { return e.Err }

// WithCause 挂上原始错误。Msg 照旧是给人看的那句话，原始错误只进日志——
// 把 err 用 %v 拼进 Msg 的话，`dial tcp ...: i/o timeout` 这种东西会原样出现在前端弹窗里。
func (e *Error) WithCause(err error) *Error {
	e.Err = err
	return e
}

// Fail 构造任意状态码的失败。
func Fail(status int, format string, args ...any) *Error {
	return &Error{Status: status, Msg: fmt.Sprintf(format, args...)}
}

// BadRequest 构造参数错误，用于校验不过的入参。
func BadRequest(format string, args ...any) *Error {
	return Fail(http.StatusBadRequest, format, args...)
}

// Unauthorized 构造未登录（或令牌已过期）。
func Unauthorized(msg string) *Error {
	return Fail(http.StatusUnauthorized, "%s", msg)
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
	var apiErr *Error
	if errors.As(err, &apiErr) {
		level := slog.LevelInfo
		if apiErr.Status >= 500 {
			level = slog.LevelWarn
		}
		attrs := []any{"method", r.Method, "path", r.URL.Path, "status", apiErr.Status, "msg", apiErr.Msg}
		if apiErr.Err != nil {
			attrs = append(attrs, "err", apiErr.Err)
		}
		slog.Log(r.Context(), level, "请求失败", attrs...)
		WriteJSON(w, apiErr.Status, Response{Code: apiErr.Status, Msg: apiErr.Msg})
		return
	}

	// 其余错误是没预料到的：SQL 报错、解析失败之类。原文只进日志，
	// 不回给客户端——那里面可能带着表名、文件路径这类不该外泄的细节
	slog.Error("未捕获异常", "method", r.Method, "path", r.URL.Path, "err", err)
	WriteJSON(w, http.StatusInternalServerError, internalError)
}

// 500 的固定响应体。Handler 和 Recover 两处共用，客户端看到的永远是这一句。
var internalError = Response{Code: http.StatusInternalServerError, Msg: "服务器内部错误"}

// OK 写一个成功响应。返回 error 只是为了让处理器能写成 `return web.OK(...)`，它永远是 nil。
func OK(w http.ResponseWriter, data any) error {
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

// DecodeJSON 解析请求体。字段级的校验由各模块的 Validate 自己做，这里只管「是不是一段合法 JSON」。
func DecodeJSON(r *http.Request, dst any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxRequestBody))
	// 多余字段直接报错而不是忽略：前端字段名拼错时，静默忽略的表现是「传了但没生效」
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return &Error{Status: http.StatusBadRequest, Msg: "请求体格式错误", Err: err}
	}
	return nil
}
