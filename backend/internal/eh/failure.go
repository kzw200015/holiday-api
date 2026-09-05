package eh

import (
	"net/http"

	"myapi/internal/web"
)

// e 站这边可以预期的失败，每种都自带该回的状态码。

// 图片配额耗尽。页面请求（assertUsable 里的 509）和图片请求（OpenImage 自己看状态码）
// 是两条独立的路径，都回到这里，文案才不会各写一句、越漂越远。
func errQuotaExceeded() error {
	return web.Fail(http.StatusTooManyRequests, "e 站图片配额已用尽，等额度恢复后再试")
}

// 出口 IP 被 e 站临时封了。
func errBanned() error {
	return web.Fail(http.StatusTooManyRequests, "本机访问 e 站过于频繁已被临时限制，请过几分钟再试")
}

// 里站返回了空页面：Cookie 无效、过期，或账号没有里站权限。
// Cookie 的问题要用户自己去处理，算请求方的错，所以是 400 不是 502。
func errSadPanda() error {
	return web.BadRequest("里站没有放行这次请求，检查一下绑定的 Cookie 是否仍然有效")
}

// 撞上内容警告插页。请求里固定带了 nw=1，还撞上说明 e 站改了这套机制。
func errContentWarning() error {
	return web.Fail(http.StatusBadGateway, "e 站返回了内容警告页，nw cookie 可能已失效")
}

// 图片地址的签名不对或已过期。这是本站自己的判断，跟上游没关系。
//
// 回 403 而不是 502：过期是有效期到点后的日常现象（默认 24 小时），
// 混进 502 的话这种噪音会把「e 站真的挂了」的信号淹掉。
func errBadSignature(msg string) error {
	return web.Fail(http.StatusForbidden, "%s", msg)
}

// 用户贴进来的那组 Cookie 拿去实际请求过一次，上游没认。
func errCredentialRejected() error {
	return web.BadRequest("这组 Cookie 用不了，确认一下是否复制完整、是否已经过期")
}

// 图片地址上少了签名参数。跟签名对不对是两回事，这里只说地址不完整。
func errIncompleteSignature() error {
	return web.BadRequest("图片地址缺少签名参数")
}

// 图集在 gdata 里查不到：被删、转私有，或者 gid/token 对不上。
func errGalleryMissing() error {
	return web.Fail(http.StatusNotFound, "这个图集取不到，可能已被删除或转为私有")
}

// 上游返回了意料之外的东西，通常是版面改了。
func errUnavailable(format string, args ...any) error {
	return web.Fail(http.StatusBadGateway, format, args...)
}

// 出网这一步本身失败了：连不上、超时、响应读到一半断了。
// 原始错误挂在 Err 上只进日志，msg 才是给人看的——`dial tcp: i/o timeout` 这种不该出现在前端弹窗里。
func errUpstream(err error, msg string) error {
	return web.Fail(http.StatusBadGateway, "%s", msg).WithCause(err)
}
