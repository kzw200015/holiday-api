package eh

import (
	"net/http"

	"myapi/internal/web"
)

// e 站这边可以预期的失败，每种都自带该回的状态码。
//
// 配额耗尽的文案单独提出来，是因为页面请求（509 落在 classifyResponse 里）和图片请求
// （openImage 自己看状态码）是两条独立的路径，各写一句会越漂越远。
const quotaExceededMsg = "e 站图片配额已用尽，等额度恢复后再试"

func errQuotaExceeded() error {
	return web.Fail(http.StatusTooManyRequests, "%s", quotaExceededMsg)
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

// 上游返回了意料之外的东西，通常是版面改了。
func errUnavailable(format string, args ...any) error {
	return web.Fail(http.StatusBadGateway, format, args...)
}
