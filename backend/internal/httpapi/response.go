package httpapi

import "net/http"

// ApiResponse 是统一接口返回结构。
type ApiResponse[T any] struct {
	Code int    `json:"code"`
	Data T      `json:"data"`
	Msg  string `json:"msg"`
}

// NewApiResponse 用于快速构造统一返回结构。
func NewApiResponse[T any](code int, data T, msg string) ApiResponse[T] {
	if msg == "" {
		msg = http.StatusText(code)
	}
	return ApiResponse[T]{
		Code: code,
		Data: data,
		Msg:  msg,
	}
}

// Ok 构造 200 响应。
func Ok[T any](data T) ApiResponse[T] {
	return NewApiResponse(http.StatusOK, data, "")
}

// BadRequest 构造 400 响应。
func BadRequest(msg string) ApiResponse[any] {
	return NewApiResponse[any](http.StatusBadRequest, nil, msg)
}

// NotFound 构造 404 响应。
func NotFound() ApiResponse[any] {
	return NewApiResponse[any](http.StatusNotFound, nil, "")
}

// InternalServerError 构造 500 响应。
func InternalServerError(msg string) ApiResponse[any] {
	return NewApiResponse[any](http.StatusInternalServerError, nil, msg)
}
