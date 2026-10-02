// Package web 是 HTTP 的处理：挂上全部接口，失败的响应与探针也在这里。
package web

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"

	"github.com/kzw200015/myapi/internal/holiday"
)

// NewServer 建出 Echo 实例并挂上全部接口：各领域的接口挂在 `/api/<领域>` 下，探针在 `/api/health` 下。
//
// 失败统一回成 [errorBody]，处理函数里的 panic 回 500。
func NewServer(pool *pgxpool.Pool, holidays *holiday.Service) *echo.Echo {
	e := echo.New()
	e.HTTPErrorHandler = handleError
	e.Use(middleware.Recover())
	holiday.Routes(e.Group("/api/holiday"), holidays)
	healthRoutes(e.Group("/api/health"), pool)
	return e
}

// ErrorCode 是失败响应里的业务错误码，HTTP 状态码照旧表达类别，它在类别之上细分。
type ErrorCode string

const (
	// InvalidParameter 是入参解析不了（400）
	InvalidParameter ErrorCode = "INVALID_PARAMETER"
	// NotFound 是路径不存在（404）
	NotFound ErrorCode = "NOT_FOUND"
	// MethodNotAllowed 是路径对、方法不对（405，带 Allow 头）
	MethodNotAllowed ErrorCode = "METHOD_NOT_ALLOWED"
	// BadRequest 是 Echo 拒绝的其余 4xx，状态码照 Echo 的
	BadRequest ErrorCode = "BAD_REQUEST"
	// DatabaseUnavailable 是数据库连不上（503）
	DatabaseUnavailable ErrorCode = "DATABASE_UNAVAILABLE"
	// InternalError 是未预料的错误（500）
	InternalError ErrorCode = "INTERNAL_ERROR"
)

// errorBody 是所有失败的响应体。
type errorBody struct {
	Code ErrorCode `json:"code"`
	// Message 是给调用方看的一句话
	Message string `json:"message"`
}

// Error 是处理函数自己决定回给调用方的失败。
type Error struct {
	Status  int
	Code    ErrorCode
	Message string
	// Cause 是失败的原因，只进日志
	Cause error
}

func (e *Error) Error() string {
	if e.Cause == nil {
		return e.Message
	}
	return e.Message + ": " + e.Cause.Error()
}

func (e *Error) Unwrap() error {
	return e.Cause
}

// handleError 把失败统一回成 [errorBody]。
//
// Echo 自己拒绝的请求（入参解析不了、路径不存在、方法不对等）状态码照 Echo 的，`message` 原样用它给的英文原话；
// 未预料的错误一律回 500 与「服务器出错了」，原文只进日志。5xx 的日志只在这里记：出事的地方不自己记，往外返回即可。
func handleError(c *echo.Context, err error) {
	body, status := errorBody{Code: InternalError, Message: "服务器出错了"}, http.StatusInternalServerError
	var own *Error
	var binding *echo.BindingError
	// rejected 是 Echo 拒绝请求时给的状态码，不是它拒绝的为 0
	rejected := echo.StatusCode(err)
	switch {
	case errors.As(err, &own):
		body, status = errorBody{Code: own.Code, Message: own.Message}, own.Status
	// 入参解析不了：Echo 的原话不带参数名，照它 Error() 的写法补上
	case errors.As(err, &binding):
		status = binding.StatusCode()
		body = errorBody{Code: codeOf(status), Message: binding.Message + ", field=" + binding.Field}
	case rejected != 0 && rejected < 500:
		status = rejected
		body = errorBody{Code: codeOf(status), Message: http.StatusText(status)}
		var httpError *echo.HTTPError
		if errors.As(err, &httpError) && httpError.Message != "" {
			body.Message = httpError.Message
		}
	}
	if status >= 500 {
		slog.Error(body.Message, "method", c.Request().Method, "path", c.Request().URL.Path, "err", err)
	}
	if err := c.JSON(status, body); err != nil {
		slog.Error("回写失败响应失败", "err", err)
	}
}

// codeOf 是 Echo 拒绝请求时的状态码对应的错误码。
func codeOf(status int) ErrorCode {
	switch status {
	case http.StatusBadRequest:
		return InvalidParameter
	case http.StatusNotFound:
		return NotFound
	case http.StatusMethodNotAllowed:
		return MethodNotAllowed
	default:
		return BadRequest
	}
}
