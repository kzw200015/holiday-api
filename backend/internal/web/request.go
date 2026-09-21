package web

import (
	"encoding/json"
	"io"
	"net/http"
)

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
