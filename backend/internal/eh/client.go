package eh

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// 前站与里站的页面地址。
var pageHosts = map[Site]string{
	SiteE:  "https://e-hentai.org",
	SiteEx: "https://exhentai.org",
}

// gdata 统一使用前站 API；showpage 使用图片所在站点的 API。
var apiHosts = map[Site]string{
	SiteE:  "https://api.e-hentai.org/api.php",
	SiteEx: "https://s.exhentai.org/api.php",
}

// 检查账号在前站是否登录成功：未登录时这个页面会 302 走。
const homeURL = "https://e-hentai.org/home.php"

// 图片能来自的主机。这是图片代理唯一的 SSRF 防线，不要放宽。
const imageHost = "ehgt.org"

// H@H 节点的域名后缀。前面那个点不能省，否则 `evilhath.network` 也会被放行。
const hathSuffix = ".hath.network"

// RequestContext 是一次上游请求的身份与站点。
type RequestContext struct {
	// 用户绑定的 Cookie，没绑就是 nil，此时匿名访问前站。
	Credential *Cookie
	Site       Site
}

// Client 统一处理 e 站请求的地址、Cookie、超时及上游错误。
type Client struct {
	http      *http.Client
	userAgent string
	// 页面与 JSON 请求的总超时。图片不受它管，见 NewClient。
	timeout time.Duration
}

// NewClient 建一个出网客户端。transport 传 nil 就用 Go 的默认实现，
// 测试拿它造上游响应——请求仍然走完整的拼地址、带 Cookie、判「200 但不是内容」这条链路。
//
// 超时分两种：页面和 JSON 是「拿到整个响应体」为止，用 ctx 上的 deadline 管；
// 图片只限「等到响应头」，交给 transport 的 ResponseHeaderTimeout。
// 不用 http.Client.Timeout，它连读响应体的时间一起算——从慢的 H@H 节点流式转发一张大图
// 可能要几十秒，按 30 秒一刀切就会在传到一半时把图掐断，跟 http.Server 那边刻意不设
// WriteTimeout 的用意正好相反。
func NewClient(userAgent string, timeout time.Duration, transport http.RoundTripper) *Client {
	if transport == nil {
		defaults := http.DefaultTransport.(*http.Transport).Clone()
		defaults.ResponseHeaderTimeout = timeout
		transport = defaults
	}
	return &Client{
		http: &http.Client{
			Transport: transport,
			// 里站 Cookie 无效时会 302 回前站，跟随的话会拿到一个「看起来正常」的前站页面。
			// 图片那条链路上它还多挡一层：白名单主机若被诱导 302 到内网，跟随就等于绕过了白名单
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		userAgent: userAgent,
		timeout:   timeout,
	}
}

// FetchPage 取一个页面的 HTML。pathAndQuery 要以 / 开头。
func (c *Client) FetchPage(ctx context.Context, rc RequestContext, pathAndQuery string) (string, error) {
	body, err := c.fetch(ctx, http.MethodGet, pageHosts[rc.Site]+pathAndQuery, buildCookieHeader(rc.Credential), nil)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// CallAPI 调 JSON API（gdata / showpage），把响应解进 out。
func (c *Client) CallAPI(ctx context.Context, rc RequestContext, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	// 前站 API 免登录，不带用户 Cookie 也就不会把身份漏给它
	credential := rc.Credential
	if rc.Site != SiteEx {
		credential = nil
	}

	content, err := c.fetch(ctx, http.MethodPost, apiHosts[rc.Site], buildCookieHeader(credential), body)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(content, out); err != nil {
		return errUpstream(err, "e 站接口返回的不是预期的 JSON")
	}
	return nil
}

// 页面与 JSON 请求共用内容校验；返回字节以便 JSON 直接解码。
func (c *Client) fetch(ctx context.Context, method, target, cookieHeader string, body []byte) ([]byte, error) {
	response, err := c.readResponse(ctx, method, target, cookieHeader, body)
	if err != nil {
		return nil, err
	}
	return response.body, assertUsable(response.status, response.body, target)
}

// OpenImage 取一张图，返回上游响应本身以便流式转发，不把整张图读进内存。
// 调用方负责关掉 Body。主机白名单在这里再校一遍：这个方法是唯一会去拉任意地址的地方。
func (c *Client) OpenImage(ctx context.Context, url string) (*http.Response, error) {
	if !IsAllowedImageURL(url) {
		slog.Warn("图片地址不在白名单内，已拒绝", "url", url)
		return nil, errUnavailable("图片地址不在允许的范围内")
	}

	// 一个 Cookie 都不带：图床不认 e 站的身份，发过去只是白白泄露给第三方主机。
	// 也不套总超时：响应体是流式转发给浏览器的，读多久由 ctx（浏览器还在不在）决定
	response, err := c.do(ctx, http.MethodGet, url, "", nil)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		// 失败响应的 body 调用方一律不读（只看状态码决定换源还是放弃），这里直接关掉。
		// H@H 节点失效是常态，一次阅读撞上几十个 403 就是几十条连接挂在那里
		response.Body.Close()
		if response.StatusCode == 509 {
			return nil, errQuotaExceeded()
		}
	}
	return response, nil
}

// VerifyCredential 验证一组 Cookie 是否可用，能用就顺便回答有没有里站权限。
// 校验放在保存之前做，免得把一组用不了的 Cookie 存进库再让人一脸茫然。
//
// 「Cookie 不对」和「e 站没连上」是两种错：前者回 400 让用户重新复制，后者是 502 或 429，
// 混成一句「这组 Cookie 用不了」会让人对着一组好好的 Cookie 反复重贴。
func (c *Client) VerifyCredential(ctx context.Context, cookie Cookie) (hasExAccess bool, err error) {
	header := buildCookieHeader(&cookie)
	// 两个请求之间没有依赖，串起来只是白等一个跨境往返。
	// 凭据无效这条路走得很少，先发后判不会浪费多少请求
	var home, ex bufferedResponse
	var homeErr, exErr error
	var wait sync.WaitGroup
	wait.Add(2)
	// 未登录时 home.php 会 302 到论坛登录页，登录成功才是 200
	go func() {
		defer wait.Done()
		home, homeErr = c.readResponse(ctx, http.MethodGet, homeURL, header, nil)
	}()
	go func() {
		defer wait.Done()
		ex, exErr = c.readResponse(ctx, http.MethodGet, pageHosts[SiteEx]+"/", header, nil)
	}()
	wait.Wait()

	if homeErr != nil {
		return false, homeErr
	}
	if home.status != http.StatusOK {
		return false, errCredentialRejected()
	}
	// 200 也可能是封禁页：那时 Cookie 本身没问题，报成「Cookie 用不了」会误导
	if err := assertUsable(home.status, home.body, homeURL); err != nil {
		return false, err
	}
	// 里站在账号没权限时回 200 加空 body（俗称 sad panda），不是 403。
	// 里站那一探连不上就当没有权限，不拦绑定：前站已经证明凭据是好的
	return exErr == nil && ex.status == http.StatusOK && len(bytes.TrimSpace(ex.body)) > 0, nil
}

// bufferedResponse 保留完整正文与状态码，让页面读取和凭据探测各自判断业务结果。
type bufferedResponse struct {
	status int
	body   []byte
}

// 页面、JSON 和凭据探测共用总超时及 Body 关闭逻辑；图片流不走这里，避免传输中途超时。
func (c *Client) readResponse(ctx context.Context, method, target, cookieHeader string, payload []byte) (bufferedResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	response, err := c.do(ctx, method, target, cookieHeader, payload)
	if err != nil {
		return bufferedResponse{}, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return bufferedResponse{}, errUpstream(err, "读取 e 站响应失败")
	}
	return bufferedResponse{status: response.StatusCode, body: body}, nil
}

// 统一的请求：伪装 UA、带上调用方给的 Cookie 头、不跟随重定向（在 Client 上配好了）。
// cookieHeader 为空串就一个 Cookie 都不发，取图走的就是这条。
func (c *Client) do(ctx context.Context, method, url, cookieHeader string, body []byte) (*http.Response, error) {
	// 排查「一次操作到底打了几个上游请求」时全靠这条，默认级别下不输出。
	// 所有出网都经过这里，日志也就只记这一处
	slog.Debug("请求 e 站", "method", method, "url", url)

	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, errUpstream(err, "拼不出 e 站的请求地址")
	}

	// Go 默认发 Go-http-client/2.0，在一个明确禁止自动化抓取的站点上等于举手
	request.Header.Set("User-Agent", c.userAgent)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if cookieHeader != "" {
		request.Header.Set("Cookie", cookieHeader)
	}

	response, err := c.http.Do(request)
	if err != nil {
		return nil, errUpstream(err, "请求 e 站失败，可能是网络不通或超时")
	}
	return response, nil
}

// assertUsable 把上游那些「200 但不是内容」的响应翻译成明确的失败。
//
// 这几种情况 e 站都回 HTTP 200，全都必须识别出来：只看状态码的话，
// IP 被封时会被当成正常 HTML 解析出空列表，然后继续按原节奏请求，把临时封禁续成长期封禁。
func assertUsable(status int, body []byte, url string) error {
	// 509 是 e 站专门用来表示图片配额耗尽的状态码，先判它——509 的响应体也可能是空的
	if status == 509 {
		return errQuotaExceeded()
	}
	// 里站在 Cookie 无效或账号无权限时回 200 + 空 body（俗称 sad panda），不是 403
	if len(bytes.TrimSpace(body)) == 0 {
		return errSadPanda()
	}

	// 按上游页面的固定文案识别异常，版面变更时需更新样本。
	if bytes.Contains(body, []byte("temporarily banned")) || bytes.Contains(body, []byte("excessive pageloads")) {
		slog.Warn("出口 IP 被 e 站临时封禁", "url", url)
		return errBanned()
	}
	// 被标记的图集在没有 nw cookie 时回一张插页，正文里既没有 #gdt 也没有 #cdiv
	if bytes.Contains(body, []byte("Content Warning")) {
		return errContentWarning()
	}

	// 3xx 在这里也是异常：正常的页面请求不会重定向，会重定向说明身份没被认下来
	if status >= 300 {
		return errUnavailable("e 站返回了 HTTP %d", status)
	}
	return nil
}

// 固定要带的 Cookie 加上用户自己的。
func buildCookieHeader(credential *Cookie) string {
	// nw=1 跳过被标记图集的内容警告插页（不带的话那些页面会返回一张没有正文的插页）；
	// sl=dm_2 把搜索结果锁定成 Compact 模式，免得账号的显示设置把列表结构换掉
	parts := []string{"nw=1", "sl=dm_2"}
	if credential != nil {
		parts = append(parts, "ipb_member_id="+credential.IpbMemberID, "ipb_pass_hash="+credential.IpbPassHash)
		if credential.Igneous != "" {
			parts = append(parts, "igneous="+credential.Igneous)
		}
	}
	return strings.Join(parts, "; ")
}

// IsAllowedImageURL 是图片主机白名单。
// 只认精确的 ehgt.org 和 *.hath.network 两类，别的一律拒绝——
// 用 Contains 或者不带点的 HasSuffix 都会被 `ehgt.org.attacker.com` 之类绕过去。
func IsAllowedImageURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil {
		return false
	}
	// H@H 节点用的是非标准端口（实测有 62121），所以端口不能限制死
	host := parsed.Hostname()
	return host == imageHost || strings.HasSuffix(host, hathSuffix)
}
