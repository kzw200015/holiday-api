package eh

import (
	"errors"
	"net/http"
	"testing"

	"myapi/internal/web"
)

// 图片主机白名单是图片代理唯一的 SSRF 防线，所以单独测。
// 这里列的绕过手法都是真会被人试的，改实现时这些用例必须继续过。
func TestIsAllowedImageURL(t *testing.T) {
	allowed := []string{
		"https://ehgt.org/w/02/611/26694-ftjxzayd.webp",
		// H@H 节点用的是非标准端口，端口不能限制死
		"https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/abc/keystamp=1-2/x.webp",
		"https://x.hath.network/h/abc/x.jpg",
	}
	for _, url := range allowed {
		if !IsAllowedImageURL(url) {
			t.Errorf("%q 应当放行", url)
		}
	}

	blocked := []string{
		// 伪装成白名单的域名：把它放在前缀里，或者少一个点
		"https://ehgt.org.attacker.com/x.jpg",
		"https://evilhath.network/x.jpg",
		"https://attacker.com/ehgt.org/x.jpg",
		"https://ehgt.org.evil/x.jpg",
		// 内网地址与非 https 协议
		"http://ehgt.org/x.jpg",
		"https://127.0.0.1/x.jpg",
		"https://localhost:5432/x.jpg",
		"https://localhost/x.jpg",
		"file:///etc/passwd",
		"http://169.254.169.254/latest/meta-data/",
		// user@host 这种形式能让粗心的主机名判断认错域
		"https://ehgt.org@attacker.com/x.jpg",
		"https://user:pass@ehgt.org/x.jpg",
		// 根本不是地址
		"", "不是地址", "//ehgt.org/x.jpg", "javascript:alert(1)",
	}
	for _, url := range blocked {
		if IsAllowedImageURL(url) {
			t.Errorf("%q 应当拒绝", url)
		}
	}
}

// 「200 但不是你要的东西」有好几种，全都必须识别出来：只看状态码的话，
// IP 被封时会被当成正常页面解析出空列表，然后继续按原节奏请求，把临时封禁续成长期封禁。
func TestAssertUsable(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   int // 期望的 HTTP 状态码，0 表示这是一份正常内容
	}{
		{509, "whatever", http.StatusTooManyRequests},
		// 509 的响应体也可能是空的，先判状态码才能给出准确的提示
		{509, "", http.StatusTooManyRequests},
		// 里站 Cookie 无效时回 200 加空 body，不是 403
		{200, "", http.StatusBadRequest},
		{200, "   \n  ", http.StatusBadRequest},
		{200, "Your IP address has been temporarily banned", http.StatusTooManyRequests},
		{200, "detected excessive pageloads", http.StatusTooManyRequests},
		{200, "<h1>Content Warning</h1>", http.StatusBadGateway},
		// 正常的页面请求不会重定向，会重定向说明身份没被认下来
		{302, "<html>go away</html>", http.StatusBadGateway},
		// 搜索没命中是正常页面，交给 parseGalleryList 返回空列表即可
		{200, "<p>No hits found</p>", 0},
		{200, `<table class="itg">...</table>`, 0},
	}

	for _, each := range cases {
		err := assertUsable(each.status, []byte(each.body), "https://e-hentai.org/")
		if each.want == 0 {
			if err != nil {
				t.Errorf("assertUsable(%d, %q) = %v, 期望放行", each.status, each.body, err)
			}
			continue
		}
		var apiErr *web.Error
		if !errors.As(err, &apiErr) || apiErr.Status != each.want {
			t.Errorf("assertUsable(%d, %q) = %v, 期望 %d", each.status, each.body, err, each.want)
		}
	}
}
