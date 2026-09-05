// Package eh 是 E-Hentai / ExHentai 的只读第三方客户端：搜索 → 详情 → 阅读 → 看评论。
//
// 分层：handler（校验入参）→ Service（对外门面：编排用例、元数据缓存、附件地址的签发与校验）
// → Client（统一 fetch：伪装 UA、带固定 Cookie、超时、异常翻译）。
// Service 底下还挂着两块自带状态的协作者：CredentialStore（凭据）和 ImageLocator（取图链路）。
package eh

import (
	"strconv"
	"strings"

	"myapi/internal/apperr"
)

// Site 是站点。里站需要有效的 igneous cookie 才进得去。
type Site string

const (
	SiteE  Site = "e"
	SiteEx Site = "ex"
)

// Cookie 是用户从浏览器里复制出来的三个 e 站 Cookie。
// 之所以让人手动粘贴而不是代填账号密码：forums.e-hentai.org 的登录接口挂在 Cloudflare 盾后面，
// 服务端直接 POST 会被 403 challenge 拦掉。
type Cookie struct {
	IpbMemberID string `json:"ipbMemberId"`
	IpbPassHash string `json:"ipbPassHash"`
	// 里站专用，没有它就只能看前站，所以允许空串。
	Igneous string `json:"igneous"`
}

func (c Cookie) validate() error {
	// igneous 可以为空（没有里站权限），另外两项不行
	if c.IpbMemberID == "" || c.IpbPassHash == "" {
		return apperr.New(apperr.InvalidArgument, "ipb_member_id 和 ipb_pass_hash 都不能为空")
	}
	// 三个值会被原样拼进 Cookie 请求头。分号能塞进额外的 cookie，空格和引号会把整个头弄坏，
	// 用户从浏览器里复制时最容易带上的正是这些（多选了一段、连着 `; ` 一起粘）
	for _, value := range []string{c.IpbMemberID, c.IpbPassHash, c.Igneous} {
		if !isCookieValue(value) {
			return apperr.New(apperr.InvalidArgument, "Cookie 值里有不允许的字符，检查是不是多复制了分号、空格或引号")
		}
	}
	return nil
}

// RFC 6265 允许的 cookie-octet：可见 ASCII，去掉空格、双引号、逗号、分号和反斜杠。
func isCookieValue(value string) bool {
	for i := 0; i < len(value); i++ {
		switch c := value[i]; {
		case c <= 0x20, c >= 0x7F, c == '"', c == ',', c == ';', c == '\\':
			return false
		}
	}
	return true
}

// CredentialStatus 是绑定状态，不含明文 Cookie。
type CredentialStatus struct {
	Bound bool `json:"bound"`
	// 未绑定时为空串。
	MemberID    string `json:"memberId"`
	HasExAccess bool   `json:"hasExAccess"`
}

// GalleryRef 是图集的定位信息，列表页 HTML 里能直接抠出来的就这两样。
type GalleryRef struct {
	GID   int64
	Token string
}

// GalleryCard 是列表里一张卡片要展示的内容，字段的声明顺序即 JSON 的序列化顺序。
type GalleryCard struct {
	GID      int64  `json:"gid"`
	Token    string `json:"token"`
	Title    string `json:"title"`
	TitleJpn string `json:"titleJpn"`
	Category string `json:"category"`
	// 已经换成本站的代理地址，不是 ehgt.org 的原始地址。
	Thumbnail string `json:"thumbnail"`
	Uploader  string `json:"uploader"`
	// ISO 8601，前端自己按本地时区格式化。
	PostedAt  string  `json:"postedAt"`
	FileCount int     `json:"fileCount"`
	Rating    float64 `json:"rating"`
	// 形如 `artist:gentsuki` 的带命名空间标签。
	Tags []string `json:"tags"`
}

// GalleryDetail 在卡片基础上多出三个字段。内嵌而不是重列一遍，
// Go 的 json 会把内嵌字段就地展开，顺序仍然是卡片在前。
type GalleryDetail struct {
	GalleryCard
	FileSize     int64 `json:"fileSize"`
	TorrentCount int   `json:"torrentCount"`
	Expunged     bool  `json:"expunged"`
}

// GalleryPage 是搜索结果一页。NextCursor 为 nil 表示已经是最后一页。
type GalleryPage struct {
	Items      []GalleryCard `json:"items"`
	NextCursor *string       `json:"nextCursor"`
}

// GalleryDetailResult 是详情接口的响应体。
type GalleryDetailResult struct {
	Gallery GalleryDetail `json:"gallery"`
	// 该账号读到第几页，没读过为 nil。
	Progress *int32 `json:"progress"`
	// 含 {page} 占位符的签名地址，前端只替换页码，不自己拼。
	ImageURLTemplate string `json:"imageUrlTemplate"`
}

// CommentSegment 是评论正文切出来的片段。
//
// 不直接给 HTML：正文是第三方站点的用户产出内容，交给前端 v-html 就是把 XSS 请进门。
// 切成片段后前端用普通 JSX 渲染，链接还能保持可点。
// type 为 break 时没有 text 和 href，靠 omitempty 省掉。
type CommentSegment struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	Href string `json:"href,omitempty"`
}

type GalleryComment struct {
	// e 站的评论 id，上传者留言固定是 0。
	ID     int64  `json:"id"`
	Author string `json:"author"`
	// ISO 8601。e 站页面上写的是 UTC。
	PostedAt   string `json:"postedAt"`
	IsUploader bool   `json:"isUploader"`
	// 形如 `+7`，未登录时页面上就没有这一项，此时为空串。
	Score    string           `json:"score"`
	Segments []CommentSegment `json:"segments"`
}

// e 站的 JSON 接口对数字的写法不统一：gid 是数字，而 filecount、rating 这些是字符串（"329"、"4.68"）。
// 两种都收下，写死成 float64 会在字符串那一侧整片报错。
type flexNumber float64

func (n *flexNumber) UnmarshalJSON(data []byte) error {
	text := strings.Trim(string(data), `"`)
	// 缺省值也照单全收：null 和空串都算 0，别让一个没填的字段废掉整批元数据
	if text == "" || text == "null" {
		*n = 0
		return nil
	}
	value, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return err
	}
	*n = flexNumber(value)
	return nil
}

// gdata 的一条记录。字段名是 e 站 API 的原样，转换成领域类型在 service 里做。
//
// 单个图集被删或转私有时，那一条会变成 `{ gid, error }`，所以 Error 也收进来，
// 让整批不至于因为一条坏数据全废。
type gdataEntry struct {
	GID          flexNumber `json:"gid"`
	Token        string     `json:"token"`
	Title        string     `json:"title"`
	TitleJpn     string     `json:"title_jpn"`
	Category     string     `json:"category"`
	Thumb        string     `json:"thumb"`
	Uploader     string     `json:"uploader"`
	Posted       flexNumber `json:"posted"`
	FileCount    flexNumber `json:"filecount"`
	FileSize     flexNumber `json:"filesize"`
	Expunged     bool       `json:"expunged"`
	Rating       flexNumber `json:"rating"`
	TorrentCount flexNumber `json:"torrentcount"`
	Tags         []string   `json:"tags"`
	Error        string     `json:"error"`
}

// 整个请求被拒时（gidlist 格式不对、条数超限）没有 gmetadata，只有一个顶层的 error。
type gdataResponse struct {
	Gmetadata []gdataEntry `json:"gmetadata"`
	Error     string       `json:"error"`
}

// showpage 的响应。成功时 i3 里是 `<img id="img" src=...>` 加上指向下一页的链接，
// showkey 过期时则是 `{"error":"Key mismatch"}`。
type showPageResponse struct {
	I3    string `json:"i3"`
	Error string `json:"error"`
}
