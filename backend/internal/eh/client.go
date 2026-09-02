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

// JSON API 的地址。
//
// 前站这个免登录就能用，返回的封面也落在 ehgt.org 上、不需要 Cookie，
// 所以取元数据一律走它；只有里站独占的图集才需要退到 s.exhentai.org 并带上 Cookie。
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

// Client 是所有对 e 站的 HTTP 调用的唯一出口：拼地址、带 Cookie、超时，
// 以及把「HTTP 200 但不是你要的东西」翻译成明确的失败。
//
// 出网不限速：请求节奏不受控，出口 IP 有被 e 站盯上的风险。
// 要加的话，加在下面 do 外面一层，而不是散到各个调用点。
type Client struct {
	http      *http.Client
	userAgent string
}

// NewClient 建一个出网客户端。transport 传 nil 就用 Go 的默认实现，
// 测试拿它造上游响应——请求仍然走完整的拼地址、带 Cookie、判「200 但不是内容」这条链路。
func NewClient(userAgent string, timeout time.Duration, transport http.RoundTripper) *Client {
	return &Client{
		http: &http.Client{
			Timeout:   timeout,
			Transport: transport,
			// 里站 Cookie 无效时会 302 回前站，跟随的话会拿到一个「看起来正常」的前站页面。
			// 图片那条链路上它还多挡一层：白名单主机若被诱导 302 到内网，跟随就等于绕过了白名单
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		userAgent: userAgent,
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
		return errUnavailable("e 站接口返回的不是预期的 JSON：%v", err)
	}
	return nil
}

// 发一次请求、读完响应体、判定它是不是真正的内容。页面和 JSON 两条路径只差编解码，
// 剩下这六步是一样的。返回 []byte 而不是 string：JSON 那条路径直接喂给 Unmarshal，
// 不必为一份几十 KB 的响应体多复制一遍。
func (c *Client) fetch(ctx context.Context, method, target, cookieHeader string, body []byte) ([]byte, error) {
	// 排查「一次操作到底打了几个上游请求」时全靠这条，默认级别下不输出
	slog.Debug("请求 e 站", "url", target)

	response, err := c.do(ctx, method, target, cookieHeader, body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	content, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, errUnavailable("读取 e 站响应失败：%v", err)
	}
	return content, assertUsable(response.StatusCode, content, target)
}

// OpenImage 取一张图，返回上游响应本身以便流式转发，不把整张图读进内存。
// 调用方负责关掉 Body。主机白名单在这里再校一遍：这个方法是唯一会去拉任意地址的地方。
func (c *Client) OpenImage(ctx context.Context, url string) (*http.Response, error) {
	if !IsAllowedImageURL(url) {
		slog.Warn("图片地址不在白名单内，已拒绝", "url", url)
		return nil, errUnavailable("图片地址不在允许的范围内")
	}
	slog.Debug("请求 e 站", "url", url)

	// 一个 Cookie 都不带：图床不认 e 站的身份，发过去只是白白泄露给第三方主机
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

// VerifyCredential 验证一组 Cookie 是否可用，顺便看看有没有里站权限。
// 校验放在保存之前做，免得把一组用不了的 Cookie 存进库再让人一脸茫然。
func (c *Client) VerifyCredential(ctx context.Context, cookie Cookie) (valid, hasExAccess bool) {
	header := buildCookieHeader(&cookie)
	// 两个请求之间没有依赖，串起来只是白等一个跨境往返。
	// 凭据无效这条路走得很少，先发后判不会浪费多少请求
	var home, ex struct {
		status int
		body   string
	}
	var wait sync.WaitGroup
	wait.Add(2)
	// 未登录时 home.php 会 302 到论坛登录页，登录成功才是 200
	go func() { defer wait.Done(); home.status, home.body = c.probe(ctx, homeURL, header) }()
	go func() { defer wait.Done(); ex.status, ex.body = c.probe(ctx, pageHosts[SiteEx]+"/", header) }()
	wait.Wait()

	if home.status != http.StatusOK {
		return false, false
	}
	// 里站在账号没权限时回 200 加空 body（俗称 sad panda），不是 403
	return true, ex.status == http.StatusOK && strings.TrimSpace(ex.body) != ""
}

// 发一次请求，只关心状态码和正文，出错时状态码为 0。
func (c *Client) probe(ctx context.Context, url, cookieHeader string) (int, string) {
	response, err := c.do(ctx, http.MethodGet, url, cookieHeader, nil)
	if err != nil {
		return 0, ""
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	return response.StatusCode, string(body)
}

// 统一的请求：伪装 UA、带上调用方给的 Cookie 头、不跟随重定向（在 Client 上配好了）。
// cookieHeader 为空串就一个 Cookie 都不发，取图走的就是这条。
func (c *Client) do(ctx context.Context, method, url, cookieHeader string, body []byte) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, errUnavailable("拼不出 e 站的请求地址：%v", err)
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
		return nil, errUnavailable("请求 e 站失败：%v", err)
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

	// 下面按字面量找，不用 (?i) 正则：那个在一页 74 KB 的 HTML 上要 2.6 毫秒（实测），
	// 而每个上游响应都得走一次判定，字面量搜索只要 2 微秒，快三个数量级——
	// 这跟当初为了躲开建 DOM 的开销、把详情页解析写成纯正则是同一个量级，白花掉就没意义了。
	// 代价是 e 站改这两张页面的文案时这里会漏判，但正则也只挡得住「大小写变了」这一种改法，
	// 换来的安全感是廉价的。下面的文案取自实测页面，改版后要重新采一次。
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
	// 「No hits found」不单列一类：搜索没命中时 parseGalleryList 自然会返回空列表，
	// 而这里多一个没人处理的分类，只会让读代码的人以为下游有对应逻辑
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
