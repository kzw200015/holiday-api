package auth

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"myapi/internal/web"
)

const bearerPrefix = "Bearer "

// 签名算法。签发和校验都写死这一个，不看令牌头里的 alg——
// 照着令牌自称的算法去验，就等于让攻击者自己挑用哪把锁。
var signingMethod = jwt.SigningMethodHS256

type ctxKey int

const userIDKey ctxKey = iota

// Tokens 是无状态令牌鉴权：登录后签发 JWT，客户端自己存着，每次请求放进 Authorization 头。
//
// 用请求头而不是 Cookie，是因为 Cookie 由浏览器自动携带，跨站表单就能借用户的身份发写请求，
// 于是还得配一层 CSRF 校验；令牌要前端主动取出来塞进头里，跨站页面读不到也就伪造不了。
// 代价是 <img src> 这类浏览器直接发起的请求带不了头——图片改走签名地址，见 internal/signing。
//
// 令牌是无状态的：服务端不存已签发的令牌，所以没法强制踢掉某个会话，只能等它过期。
// 真要做的话，加一个 users.token_epoch 列、签进载荷、改密码时 +1 即可全端下线，
// 但那样每次校验又要查库，得重新权衡。也因此没有 logout 接口：退出登录就是前端把令牌丢掉，
// 留一个只回 200 的空接口反而会让人以为服务端真作废了它。
type Tokens struct {
	secret []byte
	ttl    time.Duration
}

func NewTokens(secret string, ttl time.Duration) *Tokens {
	return &Tokens{secret: []byte(secret), ttl: ttl}
}

// Issue 登录成功后签发令牌，交给前端自己保存。
func (t *Tokens) Issue(userID int64) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(t.ttl)),
	}
	return jwt.NewWithClaims(signingMethod, claims).SignedString(t.secret)
}

// Read 软读取当前登录者：没带令牌、签名不对、载荷坏了、已过期都返回 0 而不是报错。
// GET /api/auth/me 用它来回答「当前是谁」而不触发 401——前端拿 401 会跳登录页，
// 那样登录页自己一进去就会被弹回来。
func (t *Tokens) Read(r *http.Request) int64 {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, bearerPrefix) {
		return 0
	}

	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(strings.TrimPrefix(header, bearerPrefix), claims, func(*jwt.Token) (any, error) {
		return t.secret, nil
	}, jwt.WithValidMethods([]string{signingMethod.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		return 0
	}

	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || userID <= 0 {
		return 0
	}
	return userID
}

// Require 是强制登录的中间件：没有可用令牌直接回 401，有就把用户 id 挂到 context 上。
//
// 绝不能挂在整个 /api 上：GET /api/holiday/is-holiday 有外部调用方，两个图片接口靠地址签名
// 认身份，挂全局会把这两类一起挡掉。需要登录的接口在各自的子路由里挂它。
func (t *Tokens) Require(next http.Handler) http.Handler {
	return web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		userID := t.Read(r)
		if userID == 0 {
			return web.Unauthorized("请先登录")
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey, userID)))
		return nil
	})
}

// UserID 取出 Require 挂上去的登录者。只在 Require 之后的处理器里调用，否则返回 0。
func UserID(ctx context.Context) int64 {
	userID, _ := ctx.Value(userIDKey).(int64)
	return userID
}
