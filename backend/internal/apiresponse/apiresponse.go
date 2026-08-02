// Package apiresponse 定义统一的 API 响应结构与构造函数，
// 与前端 src/types/apiResponse.ts 保持一致。
package apiresponse

// Response 是所有接口的统一响应体。
type Response struct {
	Code int    `json:"code"`
	Data any    `json:"data"`
	Msg  string `json:"msg"`
}

// OK 构造成功响应。
func OK(data any) Response {
	return Response{Code: 200, Data: data, Msg: "OK"}
}

// BadRequest 构造参数错误响应。
func BadRequest(msg string) Response {
	return Response{Code: 400, Data: nil, Msg: msg}
}

// NotFound 构造资源不存在响应。
func NotFound() Response {
	return Response{Code: 404, Data: nil, Msg: "Not Found"}
}

// InternalServerError 构造服务端错误响应。
func InternalServerError(msg string) Response {
	return Response{Code: 500, Data: nil, Msg: msg}
}
