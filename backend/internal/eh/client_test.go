package eh

import "testing"

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
