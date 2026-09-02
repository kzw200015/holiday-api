// Package signing 放不依赖 HTTP 框架的密钥运算：按用途派生子密钥、给附件地址签名。
package signing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"time"
)

// DeriveSecret 按用途从主密钥派生一把十六进制子密钥。
//
// 全局只配一把主密钥（EH_SECRET_KEY），但登录令牌签名和图片地址签名是两种不同用途。
// 直接共用同一把裸密钥的话，任何一处的实现缺陷都会波及另一处，所以统一先按用途派生。
//
// 派生规则只有这一份：写成两份的话，两边的拼法哪天不一致，同一个用途就会派生出两把不同的密钥，
// 表现是「重启后所有令牌和图片地址一起失效」。改用途标签等于换密钥，效果相同。
func DeriveSecret(secretKey, purpose string) string {
	sum := sha256.Sum256([]byte(secretKey + ":" + purpose))
	return hex.EncodeToString(sum[:])
}

// Signature 是签名地址上固定的两个查询参数。
type Signature struct {
	// 毫秒时间戳的十进制字符串，原样出现在地址里。
	ExpiresAt string
	Value     string
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
}

func NewAttachmentSigner(secret string, ttl time.Duration) *AttachmentSigner {
	return &AttachmentSigner{secret: []byte(secret), ttl: ttl}
}

// Sign 给一段业务标识签名。subject 由调用方决定要保护什么：
// 缩略图签的是上游地址，大图签的是「谁能看哪个图集」。
//
// 返回的是两个字段而不是拼好的查询串：拼地址是调用方的事，签发和校验收发同一种形状，
// 两边才对得起来。
func (s *AttachmentSigner) Sign(subject string) Signature {
	expiresAt := time.Now().Add(s.ttl).UnixMilli()
	return Signature{ExpiresAt: strconv.FormatInt(expiresAt, 10), Value: s.digest(subject, expiresAt)}
}

// Verify 校验签名与有效期，两者都过才算数。
func (s *AttachmentSigner) Verify(subject string, sig Signature) bool {
	expiresAt, err := strconv.ParseInt(sig.ExpiresAt, 10, 64)
	if err != nil || expiresAt <= time.Now().UnixMilli() {
		return false
	}
	return hmac.Equal([]byte(sig.Value), []byte(s.digest(subject, expiresAt)))
}

func (s *AttachmentSigner) digest(subject string, expiresAt int64) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(subject + ":" + strconv.FormatInt(expiresAt, 10)))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}
