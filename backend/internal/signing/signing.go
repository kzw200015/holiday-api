// Package signing 放不依赖 HTTP 框架的密钥运算：按用途派生子密钥、给附件地址签名。
package signing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"strconv"
	"time"
)

// DeriveSecret 按用途从主密钥派生一把十六进制子密钥。
//
// 全局只配一把主密钥（SECRET_KEY），但登录令牌签名和图片地址签名是两种不同用途。
// 直接共用同一把裸密钥的话，任何一处的实现缺陷都会波及另一处，所以统一先按用途派生。
//
// 派生规则只有这一份：写成两份的话，两边的拼法哪天不一致，同一个用途就会派生出两把不同的密钥，
// 表现是「重启后所有令牌和图片地址一起失效」。改用途标签等于换密钥，效果相同。
func DeriveSecret(secretKey, purpose string) string {
	sum := sha256.Sum256([]byte(secretKey + ":" + purpose))
	return hex.EncodeToString(sum[:])
}

// Signature 是签名地址上固定的两个查询参数。
//
// 参数名和它们在查询串里的形状都由这里的 Query / ParseQuery 定死——签发端和校验端
// 各写一份字面量的话，改名时漏一处的表现是所有图片一起 403。
type Signature struct {
	// 毫秒时间戳的十进制字符串，原样出现在地址里。
	ExpiresAt string
	Value     string
}

const (
	expiresParam   = "e"
	signatureParam = "s"
)

// Query 把签名拼成可以直接接在地址后面的查询串（不带前导的 ? 或 &）。
func (s Signature) Query() string {
	return expiresParam + "=" + s.ExpiresAt + "&" + signatureParam + "=" + s.Value
}

// ParseQuery 从查询参数里取出签名。两项缺任何一项都算地址不完整，ok 为 false；
// 签名对不对不在这里判，那是 AttachmentSigner.Verify 的事。
func ParseQuery(query url.Values) (Signature, bool) {
	sig := Signature{ExpiresAt: query.Get(expiresParam), Value: query.Get(signatureParam)}
	return sig, sig.ExpiresAt != "" && sig.Value != ""
}

// AttachmentSigner 给附件地址签名。
//
// 图片是浏览器的 <img src> 直接发起的请求，带不了 Authorization 头，也就拿不到 JWT。
// 所以附件不走令牌鉴权，改由服务端签发一个有时限的地址：签名覆盖「这是哪一份附件」
// 加上过期时间，两者中任何一个字节被改过，签名都对不上。
//
// 签名截成 32 个十六进制字符（128 位）。伪造要在有效期内穷举 2^128，
// 而地址本身会出现在浏览器历史和转发日志里，签得再长也挡不住转发泄露——所以有效期才是重点。
type AttachmentSigner struct {
	secret []byte
	ttl    time.Duration
	// 过期时间对齐到的粒度，见 Sign。
	bucket time.Duration
	// 测试用来固定时间，正常就是 time.Now。
	now func() time.Time
}

func NewAttachmentSigner(secret string, ttl time.Duration) *AttachmentSigner {
	// 有效期的四分之一：24 小时的有效期对应 6 小时一个窗口。
	// 测试会传很短甚至负的有效期，那时就退化成不对齐
	bucket := ttl / 4
	if bucket <= 0 {
		bucket = 1
	}
	return &AttachmentSigner{secret: []byte(secret), ttl: ttl, bucket: bucket, now: time.Now}
}

// Sign 给一段业务标识签名。subject 由调用方决定要保护什么：
// 缩略图签的是上游地址，大图签的是「谁能看哪个图集」。
//
// 返回的是两个字段而不是拼好的查询串：拼地址是调用方的事，签发和校验收发同一种形状，
// 两边才对得起来。
//
// 过期时间不是精确的 now + ttl，而是往后对齐到 bucket 的整数倍：同一个窗口里对同一个
// subject 签出来的地址一模一样。图片接口靠 URL 命中浏览器缓存，要是每次列表、每次进详情
// 都签出一个毫秒级不同的地址，缩略图和大图就永远缓存不上，翻回去看一眼也得再消耗一次
// e 站配额。代价是实际有效期比配置的多出最多一个 bucket（四分之一），只会长不会短。
func (s *AttachmentSigner) Sign(subject string) Signature {
	deadline := s.now().Add(s.ttl)
	expiresAt := deadline.Truncate(s.bucket)
	if expiresAt.Before(deadline) {
		expiresAt = expiresAt.Add(s.bucket)
	}
	millis := expiresAt.UnixMilli()
	return Signature{ExpiresAt: strconv.FormatInt(millis, 10), Value: s.digest(subject, millis)}
}

// Verify 校验签名与有效期，两者都过才算数。
func (s *AttachmentSigner) Verify(subject string, sig Signature) bool {
	expiresAt, err := strconv.ParseInt(sig.ExpiresAt, 10, 64)
	if err != nil || expiresAt <= s.now().UnixMilli() {
		return false
	}
	return hmac.Equal([]byte(sig.Value), []byte(s.digest(subject, expiresAt)))
}

func (s *AttachmentSigner) digest(subject string, expiresAt int64) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(subject))
	mac.Write([]byte(":" + strconv.FormatInt(expiresAt, 10)))
	// 截成 16 字节（128 位）再编码，正好是上面说的 32 个十六进制字符
	return hex.EncodeToString(mac.Sum(nil)[:16])
}
