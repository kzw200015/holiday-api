package eh

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"myapi/internal/auth"
)

// 路径参数随便填：鉴权挡在解析参数之前，填什么都不影响结论。
var routeParam = regexp.MustCompile(`\{[^}]+\}`)

// 鉴权边界按整张路由表扫：除了两条靠签名认人的图片接口，不带令牌一律 401。
//
// 逐条列路径的话，新加的接口没人记得补进来；这里遍历 Routes() 实际注册的每一条，
// 放错了组当场报出来。反过来，图片接口要是被误挂上 Require，<img> 就全打不开了，同样要拦住。
func TestRoutesRequireLogin(t *testing.T) {
	signed := map[string]bool{
		"GET /galleries/{gid}/{token}/pages/{page}/image": true,
		"GET /thumbnail": true,
	}
	routes := NewHandler(newValidationService(), auth.NewTokens("test", time.Hour)).Routes()

	walked := map[string]bool{}
	err := chi.Walk(routes.(chi.Routes), func(method, pattern string, _ http.Handler,
		_ ...func(http.Handler) http.Handler) error {
		route := method + " " + pattern
		walked[route] = true

		response := httptest.NewRecorder()
		routes.ServeHTTP(response, httptest.NewRequest(method, routeParam.ReplaceAllString(pattern, "1"), nil))
		if got401, want401 := response.Code == http.StatusUnauthorized, !signed[route]; got401 != want401 {
			t.Errorf("%s = %d %s", route, response.Code, response.Body)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// 图片接口改了路径却没改这里的话，上面会把它当成要登录的接口报错；
	// 这里再防另一头：名单里的路由已经不存在，这张名单就成了摆设
	for route := range signed {
		if !walked[route] {
			t.Errorf("路由表里没有 %s", route)
		}
	}
	if len(walked) <= len(signed) {
		t.Fatalf("只扫到 %d 条路由，要登录的那一组一条都没有", len(walked))
	}
}
