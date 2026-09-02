package eh

import "testing"

// 解析器是这套东西里最脆的一层：e 站随时可能改版面。
// 所以样本全是从真实页面裁下来的，见文件末尾那几个常量。

func TestParseGalleryList(t *testing.T) {
	items, cursor := parseGalleryList(galleryListHTML)

	// 同一个图集在一行里会出现在封面和标题两个链接上，去重后每个只剩一条
	want := []GalleryRef{
		{GID: 4156906, Token: "f15507afa0"},
		{GID: 4156904, Token: "7acd0468d3"},
		{GID: 4156901, Token: "3d43767d8e"},
	}
	if len(items) != len(want) {
		t.Fatalf("图集数量 = %d, 期望 %d", len(items), len(want))
	}
	for i, ref := range want {
		if items[i] != ref {
			t.Errorf("第 %d 个 = %+v, 期望 %+v", i, items[i], ref)
		}
	}

	// href 里的 & 是 &amp; 实体形式，不解码就取不到 next
	if cursor == nil || *cursor != "4156820" {
		t.Errorf("下一页游标 = %v, 期望 4156820", cursor)
	}
}

func TestParseGalleryListEdgeCases(t *testing.T) {
	// 搜索没命中时返回空列表而不是报错
	if items, cursor := parseGalleryList(emptyGalleryListHTML); len(items) != 0 || cursor != nil {
		t.Errorf("空结果页 = %v, %v，期望空列表且没有游标", items, cursor)
	}

	// 翻到最后一页时 unext 从 <a> 变成 <span>，没有 href
	if _, cursor := parseGalleryList(`<div class="searchnav"><span id="unext">Next ></span></div>`); cursor != nil {
		t.Errorf("最后一页仍取到游标 %q", *cursor)
	}

	// token 固定 10 位十六进制，短的长的都不能收
	items, _ := parseGalleryList(`<a href="/g/123/abc/">x</a><a href="/g/456/0123456789abcdef/">y</a>`)
	if len(items) != 0 {
		t.Errorf("长度不对的 token 被当成了图集: %v", items)
	}
}

func TestParseGalleryPage(t *testing.T) {
	parsed := parseGalleryPage(galleryPageHTML)

	for page, token := range map[int]string{1: "1ff5e361bb", 2: "fa27f217a6", 3: "60f2a8c343"} {
		if parsed.PageTokens[page] != token {
			t.Errorf("第 %d 页令牌 = %q, 期望 %q", page, parsed.PageTokens[page], token)
		}
	}
	// 一页详情只列 20 个 token，总数得另外从 Showing 那行读，否则 329 页的图集会被当成 20 页
	if parsed.TotalPages != 329 {
		t.Errorf("总页数 = %d, 期望 329", parsed.TotalPages)
	}
}

func TestParseGalleryPageShowingLine(t *testing.T) {
	// 数字过千会带千分位逗号；区间用来推算真实分片大小（登录用户能把每页图数改成 40 或 50）
	parsed := parseGalleryPage("<p>Showing 1,000 - 1,020 of 12,345 images</p>")
	if parsed.TotalPages != 12345 || parsed.RangeFrom != 1000 || parsed.RangeTo != 1020 {
		t.Errorf("= %+v, 期望 12345 / 1000 / 1020", parsed)
	}

	// 没有 Showing 那行时三项都是 0
	if parsed := parseGalleryPage("<html></html>"); parsed.TotalPages != 0 || parsed.RangeFrom != 0 {
		t.Errorf("没有 Showing 行时 = %+v, 期望全 0", parsed)
	}
}

func TestParseGalleryComments(t *testing.T) {
	comments, err := parseGalleryComments(galleryPageHTML)
	if err != nil {
		t.Fatal(err)
	}
	if len(comments) != 3 {
		t.Fatalf("评论数 = %d, 期望 3", len(comments))
	}

	// 上传者留言那格写的是 Uploader Comment，没有分数
	uploader := comments[0]
	if uploader.ID != 0 || !uploader.IsUploader || uploader.Author != "Pokom" || uploader.Score != "" {
		t.Errorf("上传者留言 = %+v", uploader)
	}
	// 页面上写的 31 October 2021, 04:19 是 UTC
	normal := comments[1]
	if normal.ID != 4567998 || normal.IsUploader || normal.Score != "+7" ||
		normal.PostedAt != "2021-10-31T04:19:00.000Z" {
		t.Errorf("普通评论 = %+v", normal)
	}

	// 正文切成片段：换行和链接都要保住
	segments := uploader.Segments
	if len(segments) < 2 || segments[0] != (CommentSegment{Type: "text", Text: "Support:"}) ||
		segments[1].Type != "break" {
		t.Errorf("正文片段开头 = %+v", segments)
	}
	if !hasSegment(segments, CommentSegment{
		Type: "link",
		Text: "https://e-hentai.org/g/2231377/5366ade18e/",
		Href: "https://e-hentai.org/g/2231377/5366ade18e/",
	}) {
		t.Errorf("正文里的链接没解析出来: %+v", segments)
	}
}

func TestParseGalleryCommentsDropsJavaScriptLinks(t *testing.T) {
	comments, err := parseGalleryComments(
		`<div id="cdiv"><div class="c1"><div class="c6" id="comment_1">` +
			`<a href="javascript:alert(1)">点我</a></div></div></div>`)
	if err != nil {
		t.Fatal(err)
	}

	// 不放行就意味着前端拿不到可点的 href，XSS 从源头断掉
	segments := comments[0].Segments
	if !hasSegment(segments, CommentSegment{Type: "text", Text: "点我"}) {
		t.Errorf("javascript 链接没降级成纯文本: %+v", segments)
	}
	for _, segment := range segments {
		if segment.Type == "link" {
			t.Errorf("javascript 伪协议被当成了链接: %+v", segment)
		}
	}
}

func TestParseImagePage(t *testing.T) {
	parsed := parseImagePage(imagePageHTML)

	// 图床节点挂掉时靠 reloadToken 换一台机器重取
	if parsed.ShowKey != "fqoint3an90" || parsed.ReloadToken != "50398-496692" {
		t.Errorf("= %+v", parsed)
	}
	if want := "https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/"; len(parsed.ImageURL) < len(want) ||
		parsed.ImageURL[:len(want)] != want {
		t.Errorf("图片地址 = %q", parsed.ImageURL)
	}

	// 页面不是图片页时三项都是空
	if parsed := parseImagePage("<html><body>Content Warning</body></html>"); parsed != (imagePage{}) {
		t.Errorf("非图片页 = %+v, 期望全空", parsed)
	}
}

func TestParseShowPageFragment(t *testing.T) {
	// 真实响应里 i3 的形状：本页的图，外面套着指向下一页的链接
	i3 := `<a onclick="return load_image(4, 'cb8cbc96af')" href="https://e-hentai.org/s/cb8cbc96af/2231376-4">` +
		`<img id="img" src="https://x.hath.network/h/abc/keystamp=1-2/3834916_3.webp" style="..." /></a>`

	// 下一页的 token 白送，顺序阅读就不用再回头请求详情页了
	url, page, token := parseShowPageFragment(i3)
	if url != "https://x.hath.network/h/abc/keystamp=1-2/3834916_3.webp" || page != 4 || token != "cb8cbc96af" {
		t.Errorf("= %q, %d, %q", url, page, token)
	}

	// 最后一页没有下一页链接
	if _, page, _ := parseShowPageFragment(`<img id="img" src="https://x.hath.network/a.jpg" />`); page != 0 {
		t.Errorf("最后一页仍解析出下一页 %d", page)
	}
}

func TestClassifyResponse(t *testing.T) {
	// 「200 但不是你要的东西」有好几种，全都必须识别出来：
	// 只看状态码的话，IP 被封时会被当成正常页面解析出空列表，然后继续按原节奏请求
	cases := []struct {
		status int
		body   string
		want   responseKind
	}{
		{509, "whatever", responseQuotaExceeded},
		// 509 的响应体也可能是空的，先判状态码才能给出准确的提示
		{509, "", responseQuotaExceeded},
		// 里站 Cookie 无效时回 200 加空 body，不是 403
		{200, "", responseSadPanda},
		{200, "   \n  ", responseSadPanda},
		{200, "Your IP address has been temporarily banned", responseIPBanned},
		{200, "detected excessive pageloads", responseIPBanned},
		{200, "<h1>Content Warning</h1>", responseContentWarning},
		// 搜索没命中是正常页面，交给 parseGalleryList 返回空列表即可
		{200, "<p>No hits found</p>", responseOK},
		{200, `<table class="itg">...</table>`, responseOK},
	}
	for _, each := range cases {
		if got := classifyResponse(each.status, each.body); got != each.want {
			t.Errorf("classifyResponse(%d, %q) = %v, 期望 %v", each.status, each.body, got, each.want)
		}
	}
}

func TestDecodeEntities(t *testing.T) {
	cases := map[string]string{
		// gdata 返回的标题就是转义过的，实测有 Arcueid &amp; Ciel x Goblin
		"Arcueid &amp; Ciel x Goblin":             "Arcueid & Ciel x Goblin",
		"&lt;tag&gt; &quot;q&quot; &#039;a&#039;": `<tag> "q" 'a'`,
		"&#65;&#x42;": "AB",
		// 不认识的实体原样保留。用宽松的解码规则会把 &not 解掉，标题里的字面量就被改写了
		"&notreal; &amp;": "&notreal; &",
	}
	for input, want := range cases {
		if got := decodeEntities(input); got != want {
			t.Errorf("decodeEntities(%q) = %q, 期望 %q", input, got, want)
		}
	}
}

func hasSegment(segments []CommentSegment, want CommentSegment) bool {
	for _, segment := range segments {
		if segment == want {
			return true
		}
	}
	return false
}

// 下面几段是从真实页面裁下来的样本（2026-08-30）。留的是两类东西：解析器要认出来的结构，
// 以及会干扰它的噪声——同一行里其它形式的 gid/token 链接、分页导航里 unext 之外的那几个 id。
// 纯展示用的属性（style、标签列表、重复的标题）删掉了。
// 重新采样时保持同样的裁剪方式：结构特征要真实，体积要小。

// 取自 https://e-hentai.org/?f_search=language:chinese
const galleryListHTML = `<html><body>
<table class="itg gltc">
<tr><td class="gl1c glcat"><div class="cn ct9" onclick="document.location='https://e-hentai.org/non-h'">Non-H</div></td><td class="gl2c"><div class="glthumb" id="it4156906"><div><img src="https://ehgt.org/w/02/611/26694-ftjxzayd.webp" /></div><div><div onclick="popUp('https://e-hentai.org/gallerypopups.php?gid=4156906&amp;t=f15507afa0&amp;act=addfav',675,415)" id="postedpop_4156906">2026-08-30 09:50</div></div></div></td><td class="gl3c glname" onmouseover="show_image_pane(4156906);preload_pane_image(0,4156904)"><a href="https://e-hentai.org/g/4156906/f15507afa0/"><div class="glink">[SHISENTAISHA(Mhz33) ] TO THE INSIDE OF A DREAM</div><div><div class="gt" title="language:chinese">chinese</div></div></a></td><td class="gl4c glhide"><div><a href="https://e-hentai.org/uploader/rominal">rominal</a></div><div>25 pages</div></td></tr>
<tr><td class="gl1c glcat"><div class="cn ct1" onclick="document.location='https://e-hentai.org/misc'">Misc</div></td><td class="gl2c"><div class="glthumb" id="it4156904"><div><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://ehgt.org/w/02/611/28738-6cww5arn.webp" /></div><div><div onclick="popUp('https://e-hentai.org/gallerypopups.php?gid=4156904&amp;t=7acd0468d3&amp;act=addfav',675,415)" id="postedpop_4156904">2026-08-30 09:50</div></div></div></td><td class="gl3c glname" onmouseover="show_image_pane(4156904);preload_pane_image(4156906,4156901)"><a href="https://e-hentai.org/g/4156904/7acd0468d3/"><div class="glink">[buchile] 玩玩刻晴的小笼包~Keqing&#039;s breasts [Chinese] [AI Generated]</div><div><div class="gt" title="language:chinese">chinese</div></div></a></td><td class="gl4c glhide"><div><a href="https://e-hentai.org/uploader/humanlivestock">humanlivestock</a></div><div>46 pages</div></td></tr>
<tr><td class="gl1c glcat"><div class="cn ct3" onclick="document.location='https://e-hentai.org/manga'">Manga</div></td><td class="gl2c"><div class="glthumb" id="it4156901"><div><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://ehgt.org/w/02/611/28862-1qqhwe3h.webp" /></div><div><div onclick="popUp('https://e-hentai.org/gallerypopups.php?gid=4156901&amp;t=3d43767d8e&amp;act=addfav',675,415)" id="postedpop_4156901">2026-08-30 09:49</div></div><div class="gldown"><a href="https://e-hentai.org/gallerytorrents.php?gid=4156901&amp;t=3d43767d8e" rel="nofollow"><img src="https://ehgt.org/g/t.png" alt="T" /></a></div></div></td><td class="gl3c glname" onmouseover="show_image_pane(4156901);preload_pane_image(4156904,4156895)"><a href="https://e-hentai.org/g/4156901/3d43767d8e/"><div class="glink">[Chococornet (tenro aya)] Tentacle Esthetics (Chinese)</div><div><div class="gt" title="language:chinese">chinese</div></div></a></td><td class="gl4c glhide"><div><a href="https://e-hentai.org/uploader/Colt4448">Colt4448</a></div><div>7 pages</div></td></tr>
</table>
<div class="searchnav">
	<div><span id="ufirst">&lt;&lt; First</span></div><div><span id="uprev">&lt; Prev</span></div><div id="ujumpbox" class="jumpbox"><a id="ujump" href="javascript:enable_jump_mode('u')">Jump/Seek</a></div><div><a id="unext" href="https://e-hentai.org/?f_search=language:chinese&amp;next=4156820">Next &gt;</a></div><div><a id="ulast" href="https://e-hentai.org/?f_search=language:chinese&amp;prev=1">Last &gt;&gt;</a></div>
</div>
</body></html>`

// 取自一个没有命中的搜索
const emptyGalleryListHTML = `<html><body>
<div style="position:relative; z-index:2"><p style="text-align:center; font-style:italic; margin-bottom:10px">No hits found</p></div>
</body></html>`

// 取自 https://e-hentai.org/g/2231376/a7584a5932/
const galleryPageHTML = `<html><body>
<p class="gpc">Showing 1 - 20 of 329 images</p>
<div id="gdt">
<a href="https://e-hentai.org/s/1ff5e361bb/2231376-1"><div title="Page 1: 3834916_1.jpg" style="background:transparent url(https://ehgt.org/1f/f5/1ff5e361bb-2722367-1882-3000-jpg_l.jpg) 0 0 no-repeat"></div></a>
<a href="https://e-hentai.org/s/fa27f217a6/2231376-2"><div title="Page 2: 3834916_2.jpg" style="background:transparent url(https://ehgt.org/fa/27/fa27f217a6-2565065-1882-3000-jpg_l.jpg) 0 0 no-repeat"></div></a>
<a href="https://e-hentai.org/s/60f2a8c343/2231376-3"><div title="Page 3: 3834916_3.jpg" style="background:transparent url(https://ehgt.org/60/f2/60f2a8c343-2301853-1882-3000-jpg_l.jpg) 0 0 no-repeat"></div></a>
</div>
<div id="cdiv" class="gm">
<div class="c1"><div class="c2"><div class="c3">Posted on 28 May 2022, 01:53 by: &nbsp; <a href="https://e-hentai.org/uploader/Pokom">Pokom</a>&nbsp; &nbsp; <a href="https://forums.e-hentai.org/index.php?showuser=4764920"><img class="ygm" src="https://ehgt.org/g/ygm.png" alt="PM" title="Contact Poster" /></a></div><div class="c4 nosel"><a name="ulcomment"></a>Uploader Comment</div><div class="c"></div></div><div class="c6" id="comment_0">Support:<br />https://gentuki0999.fanbox.cc/<br />https://fantia.jp/fanclubs/12432<br /><br />Non-color version (more images): <a href="https://e-hentai.org/g/2231377/5366ade18e/">https://e-hentai.org/g/2231377/5366ade18e/</a></div><div class="c7" id="cvotes_0" style="display:none"></div></div>
<div class="c1"><div class="c2"><div class="c3">Posted on 31 October 2021, 04:19 by: &nbsp; <a href="https://e-hentai.org/uploader/%E4%BC%A4%E5%BF%83%E6%82%B2%E7%97%9B%E6%AC%B2%E7%BB%9D">伤心悲痛欲绝</a>&nbsp; &nbsp; <a href="https://forums.e-hentai.org/index.php?showuser=2366191"><img class="ygm" src="https://ehgt.org/g/ygm.png" alt="PM" title="Contact Poster" /></a></div><div class="c5 nosel" onclick="this.onmouseover(); this.onmouseout=undefined">Score <span id="comment_score_4567998" style="opacity:1.0">+7</span></div><div class="c"></div></div><div class="c6" id="comment_4567998">Mark In ２０２１happyHelloween！ <br />実にいいわ～たまらない。 <br />#[Gentsuki]<br />【#ゲンツキ】<br /> <br />社保</div><div class="c7" id="cvotes_4567998" style="display:none">Base +6, <span>凌浩辰 -5</span>, <span>DanTabris +6</span></div></div>
<div class="c1"><div class="c2"><div class="c3">Posted on 22 November 2021, 16:39 by: &nbsp; <a href="https://e-hentai.org/uploader/mish2001">mish2001</a>&nbsp; &nbsp; <a href="https://forums.e-hentai.org/index.php?showuser=5198055"><img class="ygm" src="https://ehgt.org/g/ygm.png" alt="PM" title="Contact Poster" /></a></div><div class="c5 nosel">Score <span id="comment_score_4605522" style="opacity:1.0">+30</span></div><div class="c"></div></div><div class="c6" id="comment_4605522">you are a god among men my comrade, Спасибо, друг</div><div class="c7" id="cvotes_4605522" style="display:none">Base +5, <span>Tabletochnik +6</span></div></div>
</div>
</body></html>`

// 取自 https://e-hentai.org/s/1ff5e361bb/2231376-1
const imagePageHTML = `<html><body>
<script>var showkey="fqoint3an90";</script>
<img id="img" src="https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/7f1f75c8908382d709d2ed5484cd89ee69fa2b12-225562-1280-2040-wbp/keystamp=1788091800-d92c7fe59f;fileindex=108579204;xres=1280/3834916_1.webp" style="height:2040px;width:1280px" onerror="this.onerror=null; nl('50398-496692')" onload="update_window_extents()"/>
</body></html>`
