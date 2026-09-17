package eh

import (
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

// 解析仅由 HTML 提供的图集列表、图片定位信息和评论，不发请求、不修改缓存。
// 正则捕获值用 strings.Clone 复制，避免缓存短字符串时持有整页 HTML。

var (
	// 图集链接。不挑 `td.gl3c.glname` 这类选择器是因为搜索结果有 5 种显示模式，
	// 由账号设置决定：Thumbnail 模式下整个 <table> 都不存在。全文正则抓链接对所有模式都成立。
	galleryLinkRE = regexp.MustCompile(`/g/(\d+)/([0-9a-f]{10})/`)
	// 图片页链接，形如 /s/<ptoken>/<gid>-<页码>。
	imagePageLinkRE = regexp.MustCompile(`/s/([0-9a-f]{10})/\d+-(\d+)`)
	// 详情页上的「Showing 1 - 20 of 329」。数字过千会带千分位逗号。
	showingRE = regexp.MustCompile(`Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)`)
	// 大图本身。图片页和 showpage 的 i3 片段用的是同一个标签，所以共用这一条。
	mainImageRE = regexp.MustCompile(`<img[^>]*\bid="img"[^>]*\bsrc="([^"]+)"`)
	// 分页导航里的下一页链接。翻到最后一页时 unext 会变成 <span>，没有 href。
	nextCursorRE  = regexp.MustCompile(`<a[^>]*\bid="unext"[^>]*\bhref="([^"]*)"`)
	showKeyRE     = regexp.MustCompile(`var\s+showkey\s*=\s*"([^"]+)"`)
	reloadTokenRE = regexp.MustCompile(`nl\('([^']+)'\)`)
	// 评论时间，形如 `28 May 2022, 01:53`，页面上写的是 UTC。
	postedAtRE = regexp.MustCompile(`Posted on (\d{1,2} \w+ \d{4}, \d{2}:\d{2})`)
	// 严格形式的 HTML 实体：必须带分号。
	entityRE = regexp.MustCompile(`&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);`)
)

// decodeEntities 解码 HTML 实体。
// gdata 返回的 title 和 tags 也是转义过的（实测有 `Arcueid &amp; Ciel x Goblin`），
// 那边没有 DOM 可用，所以这个函数要能独立处理纯字符串。
//
// 只认带分号的严格写法。直接用 html.UnescapeString 不行：它按 HTML5 的历史兼容规则，
// 允许 `&not` 这类实体省掉分号，于是 `&notreal;` 会被解成 `¬real;`——
// 标题里出现这种字面量就被改写了。这种半吊子结果的特征是尾巴上还留着没被吃掉的分号，
// 据此把它退回原样（`&semi;` 本身解出来就是一个分号，是唯一的例外）。
func decodeEntities(text string) string {
	if !strings.Contains(text, "&") {
		return text
	}
	return entityRE.ReplaceAllStringFunc(text, func(entity string) string {
		decoded := html.UnescapeString(entity)
		if decoded != ";" && strings.HasSuffix(decoded, ";") {
			return entity
		}
		return decoded
	})
}

// parseGalleryList 解析搜索结果页，只取图集序列和下一页游标。
func parseGalleryList(page string) ([]GalleryRef, *string, error) {
	seen := map[int64]bool{}
	var items []GalleryRef

	for _, match := range galleryLinkRE.FindAllStringSubmatch(page, -1) {
		gid, err := strconv.ParseInt(match[1], 10, 64)
		// 同一个图集在一行里会出现在多个链接上（封面、标题），按 gid 去重后顺序即页面顺序
		if err != nil || seen[gid] {
			continue
		}
		seen[gid] = true
		items = append(items, GalleryRef{GID: gid, Token: strings.Clone(match[2])})
	}

	if len(items) == 0 && !strings.Contains(page, "No hits found") {
		return nil, nil, errUnavailable("没有识别出图集搜索结果，e 站版面可能改了")
	}
	return items, parseNextCursor(page), nil
}

func parseNextCursor(page string) *string {
	match := nextCursorRE.FindStringSubmatch(page)
	if match == nil {
		return nil
	}
	// href 里的 & 是 &amp; 实体形式，先解码再交给查询串解析
	_, query, found := strings.Cut(decodeEntities(match[1]), "?")
	if !found {
		return nil
	}
	values, err := url.ParseQuery(query)
	if err != nil || values.Get("next") == "" {
		return nil
	}
	cursor := values.Get("next")
	return &cursor
}

// galleryPage 是详情页里跟取图有关的部分。
type gallerySlice struct {
	HTML       string
	PageTokens map[int]string
	// 一页详情只带 20 个 token（登录用户能调成 40/50），所以总页数要另外从 Showing 那行取，
	// 不能拿 len(PageTokens) 当总数。0 表示没取到。
	TotalPages int
	// 本片覆盖的页码区间（Showing 里的那两个数），用来推算真实的分片大小。0 表示没取到。
	RangeFrom, RangeTo int
}

// parseGalleryPage 解析每页 token、总页数与分片区间，取图链路不需要构建评论 DOM。
func parseGalleryPage(page string) gallerySlice {
	result := gallerySlice{HTML: page, PageTokens: map[int]string{}}
	for _, match := range imagePageLinkRE.FindAllStringSubmatch(page, -1) {
		number, err := strconv.Atoi(match[2])
		if err != nil || result.PageTokens[number] != "" {
			continue
		}
		result.PageTokens[number] = strings.Clone(match[1])
	}

	if showing := showingRE.FindStringSubmatch(page); showing != nil {
		result.RangeFrom = parseGrouped(showing[1])
		result.RangeTo = parseGrouped(showing[2])
		result.TotalPages = parseGrouped(showing[3])
	}
	return result
}

// 「12,345」这种带千分位逗号的数字。
func parseGrouped(text string) int {
	number, err := strconv.Atoi(strings.ReplaceAll(text, ",", ""))
	if err != nil {
		return 0
	}
	return number
}

// imagePage 是 /s/ 页面里取图要用的三样东西。
type imagePage struct {
	ShowKey   string
	ImageURL  string
	NextPage  int
	NextToken string
	// 图床节点失效时靠它换一台机器重取。
	ReloadToken string
}

func parseImagePage(page string) imagePage {
	imageURL, nextPage, nextToken := parseShowPageFragment(page)
	return imagePage{
		NextPage:    nextPage,
		NextToken:   nextToken,
		ShowKey:     firstGroup(showKeyRE, page),
		ImageURL:    imageURL,
		ReloadToken: firstGroup(reloadTokenRE, page),
	}
}

// parseShowPageFragment 从 i3 片段提取图片地址和下一页令牌；没有下一页链接时 nextPage 为 0。
func parseShowPageFragment(i3 string) (imageURL string, nextPage int, nextToken string) {
	if match := imagePageLinkRE.FindStringSubmatch(i3); match != nil {
		nextPage, _ = strconv.Atoi(match[2])
		nextToken = strings.Clone(match[1])
	}
	return firstGroup(mainImageRE, i3), nextPage, nextToken
}

func firstGroup(re *regexp.Regexp, text string) string {
	if match := re.FindStringSubmatch(text); match != nil {
		return strings.Clone(match[1])
	}
	return ""
}

// parseGalleryComments 解析详情页里的评论。只有评论接口会调，因为它是这里唯一需要建 DOM 的东西。
func parseGalleryComments(page string) ([]GalleryComment, error) {
	document, err := goquery.NewDocumentFromReader(strings.NewReader(page))
	if err != nil {
		return nil, err
	}

	// 评论和正文片段使用空切片，保证 JSON 输出 []。
	comments := []GalleryComment{}
	document.Find("#cdiv .c1").Each(func(_ int, block *goquery.Selection) {
		meta := block.Find(".c3").First()
		body := block.Find(".c6").First()

		id := int64(0)
		if elementID, ok := body.Attr("id"); ok {
			id, _ = strconv.ParseInt(strings.TrimPrefix(elementID, "comment_"), 10, 64)
		}

		comments = append(comments, GalleryComment{
			ID:       id,
			Author:   strings.TrimSpace(meta.Find("a").First().Text()),
			PostedAt: parsePostedAt(meta.Text()),
			// 上传者留言用 .c4 写着 Uploader Comment，其余条目那个位置是 .c5 的分数
			IsUploader: block.Find(".c4").Length() > 0,
			Score:      strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(block.Find(".c5").First().Text()), "Score")),
			Segments:   parseSegments(body),
		})
	})
	return comments, nil
}

// 把 `28 May 2022, 01:53` 转成 ISO 字符串。解析不出来时返回空串，让前端显示原始占位而不是崩掉。
func parsePostedAt(text string) string {
	match := postedAtRE.FindStringSubmatch(text)
	if match == nil {
		return ""
	}
	// 页面上写的是 UTC
	posted, err := time.Parse("2 January 2006, 15:04", match[1])
	if err != nil {
		return ""
	}
	return posted.UTC().Format(isoLayout)
}

// 毫秒三位、UTC 的 Z 后缀，前端直接喂给 new Date()。
const isoLayout = "2006-01-02T15:04:05.000Z"

// parseSegments 把评论正文的 DOM 拍平成片段数组，顺带把 javascript: 这类链接降级成纯文本。
func parseSegments(body *goquery.Selection) []CommentSegment {
	segments := []CommentSegment{}

	var walk func(selection *goquery.Selection)
	walk = func(selection *goquery.Selection) {
		selection.Contents().Each(func(_ int, node *goquery.Selection) {
			switch goquery.NodeName(node) {
			case "#text":
				if text := node.Text(); text != "" {
					segments = append(segments, CommentSegment{Type: "text", Text: text})
				}
			case "br":
				segments = append(segments, CommentSegment{Type: "break"})
			case "a":
				href, _ := node.Attr("href")
				// 只放行 http/https，javascript: 和 data: 一律降级成普通文字
				if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
					segments = append(segments, CommentSegment{Type: "link", Text: node.Text(), Href: href})
				} else {
					segments = append(segments, CommentSegment{Type: "text", Text: node.Text()})
				}
			default:
				walk(node)
			}
		})
	}
	walk(body)

	return mergeAdjacentText(segments)
}

// 相邻的文本片段合并成一段，免得前端渲染出一串没必要的节点。
func mergeAdjacentText(segments []CommentSegment) []CommentSegment {
	merged := []CommentSegment{}
	for _, segment := range segments {
		last := len(merged) - 1
		if segment.Type == "text" && last >= 0 && merged[last].Type == "text" {
			merged[last].Text += segment.Text
			continue
		}
		merged = append(merged, segment)
	}
	return merged
}
