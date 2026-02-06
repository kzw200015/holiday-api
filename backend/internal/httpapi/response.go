package httpapi

// ApiResponse 是统一接口返回结构。
type ApiResponse[T any] struct {
	Code int    `json:"code"`
	Data T      `json:"data"`
	Msg  string `json:"msg"`
}
