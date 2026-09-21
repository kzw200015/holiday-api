package app_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"myapi/internal/app"
	"myapi/internal/auth"
	authstore "myapi/internal/auth/store"
	"myapi/internal/eh"
	ehstore "myapi/internal/eh/store"
	"myapi/internal/holiday"
	holidaystore "myapi/internal/holiday/store"
	"myapi/internal/keylock"
	"myapi/internal/signing"
)

// 签名图片地址的闭环：详情接口签发的地址，图片接口必须认得出来。
//
// 这一层单独测，是因为地址在「签发」（eh/service_image.go 拼模板）和「校验」（eh/handler.go 的路由模式
// 加 eh/handler_image.go 读 uid/e/s）两处各拼一次，两边哪天不一致，表现是所有图片突然打不开，
// 而各自的单元测试都是绿的。这也是 <img> 那条链路唯一的鉴权，所以顺带确认改 uid 冒充别人是不行的。
//
// 顺路把整个应用的两条通用契约也锁住：未登录回 401、未匹配的 /api 路径回 JSON 404。

const testUserID = 7

func TestSignedImageURLRoundTrip(t *testing.T) {
	router, token := newTestRouter(t)

	detail := fetchDetail(t, router, token)
	template, _ := detail["imageUrlTemplate"].(string)
	if !strings.Contains(template, "{page}") {
		t.Fatalf("大图地址模板里没有页码占位符: %q", template)
	}

	// 前端只做这一件事：把 {page} 换成页码。不带 Authorization，走的就是 <img> 的形态
	response := do(t, router, strings.Replace(template, "{page}", "3", 1), "")
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "image/webp" {
		t.Fatalf("大图 = %d %s %s", response.Code, response.Header().Get("Content-Type"), response.Body)
	}

	// 列表和详情里的缩略图地址同样要能自洽
	thumbnail := detail["gallery"].(map[string]any)["thumbnail"].(string)
	if response := do(t, router, thumbnail, ""); response.Code != http.StatusOK {
		t.Fatalf("缩略图 = %d %s", response.Code, response.Body)
	}
}

func TestSignedImageURLRejectsForgedUser(t *testing.T) {
	router, token := newTestRouter(t)

	template := fetchDetail(t, router, token)["imageUrlTemplate"].(string)
	// 签名覆盖了 uid，换个人就对不上——否则拿到一条地址就能用别人的 e 站凭据取图
	forged := strings.Replace(strings.Replace(template, "{page}", "3", 1), "uid=7", "uid=8", 1)

	// 403 而不是 502：签名不对是本站自己的判断，跟 e 站有没有故障无关
	response := do(t, router, forged, "")
	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), "签名不正确或已过期") {
		t.Fatalf("伪造 uid 的请求 = %d %s", response.Code, response.Body)
	}
}

func TestApiContract(t *testing.T) {
	router, _ := newTestRouter(t)

	// 公开查询不能被模块组装时误挂上的鉴权挡住，参数错误也仍走统一翻译。
	for _, each := range []struct {
		path string
		code int
		body string
	}{
		{"/api/holiday/is-holiday?date=2026-01-04", 200, `{"code":200,"data":true,"msg":"OK"}`},
		{"/api/holiday/is-holiday?date=invalid", 400, `{"code":400,"data":null,"msg":"日期格式错误，应为 YYYY-MM-DD"}`},
		{"/api/auth/me", 200, `{"code":200,"data":null,"msg":"OK"}`},
	} {
		response := do(t, router, each.path, "")
		if response.Code != each.code || response.Body.String() != each.body+"\n" {
			t.Errorf("%s = %d %s", each.path, response.Code, response.Body)
		}
	}

	// 需要登录的接口不带令牌就是 401，响应体仍然是统一结构。
	// 搜索走 POST，不带请求体也能拿到 401：鉴权在解请求体之前，顺带钉住这条路由确实挂在鉴权那一组里
	response := send(t, router, http.MethodPost, "/api/eh/galleries/search", "")
	if response.Code != http.StatusUnauthorized ||
		response.Body.String() != `{"code":401,"data":null,"msg":"请先登录"}`+"\n" {
		t.Errorf("未登录访问 = %d %s", response.Code, response.Body)
	}

	// 未匹配的 /api 路径统一回 JSON 404；非 /api 路径则是无响应体的 404（前端是哈希路由）
	for _, path := range []string{"/api/unknown", "/api"} {
		response := do(t, router, path, "")
		if response.Code != http.StatusNotFound ||
			response.Body.String() != `{"code":404,"data":null,"msg":"Not Found"}`+"\n" {
			t.Errorf("%s = %d %s", path, response.Code, response.Body)
		}
	}
	if response := do(t, router, "/unknown", ""); response.Code != http.StatusNotFound || response.Body.Len() != 0 {
		t.Errorf("/unknown = %d %q", response.Code, response.Body)
	}
}

// 用真实的服务组装一次应用，只把数据库和出网这两处换成假的。
func newTestRouter(t *testing.T) (http.Handler, string) {
	t.Helper()

	queries := ehstore.New(emptyDB{})
	tokens := auth.NewTokens("jwt-子密钥", time.Hour)
	// 假 db 一律返回空行，所以这条链路走的是「未绑定凭据」，匿名看前站
	client := eh.NewClient("test-agent", time.Second, upstream{})
	ehService := eh.NewService(eh.NewUserState(queries), client,
		eh.NewCredentialStore(queries, client, keylock.New()), eh.NewImageLocator(client),
		signing.NewAttachmentSigner("attachment-子密钥", time.Hour))

	// 指向一个不存在的目录，让所有非 /api 路径都落到无响应体的 404
	router := app.NewRouter(t.TempDir()+"/no-static",
		holiday.NewHandler(holiday.NewService(nil, holidaystore.New(emptyDB{}), nil)),
		auth.NewHandler(auth.NewService(authstore.New(emptyDB{}), false), tokens),
		eh.NewHandler(ehService, tokens))

	token, err := tokens.Issue(testUserID)
	if err != nil {
		t.Fatal(err)
	}
	return router, token
}

func fetchDetail(t *testing.T, router http.Handler, token string) map[string]any {
	t.Helper()

	response := do(t, router, "/api/eh/galleries/2231376/a7584a5932", token)
	if response.Code != http.StatusOK {
		t.Fatalf("详情 = %d %s", response.Code, response.Body)
	}

	var body struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Data
}

func do(t *testing.T, router http.Handler, path, token string) *httptest.ResponseRecorder {
	return send(t, router, http.MethodGet, path, token)
}

func send(t *testing.T, router http.Handler, method, path, token string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(method, path, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

// 假的出网：gdata 回一条能过解析的元数据，两种页面各回一份最小样本，取图回一张 1 像素的图。
type upstream struct{}

func (upstream) RoundTrip(request *http.Request) (*http.Response, error) {
	body, contentType := "", "text/html"
	switch {
	case strings.Contains(request.URL.Host, "api."):
		body, contentType = gdataJSON, "application/json"
	case strings.HasPrefix(request.URL.Path, "/s/"):
		// 取图要先抓详情页分片拿每页令牌，再抓 /s/ 页面拿真正的图片地址
		body = `<div id="i3"><a href="#"><img id="img" src="https://ehgt.org/p3.webp"></a></div>`
	case strings.HasPrefix(request.URL.Path, "/g/"):
		body = `Showing 1 - 20 of 329 <a href="/s/bbbbbbbbbb/2231376-3">`
	default:
		body, contentType = "\x01\x02\x03", "image/webp"
	}

	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{contentType}},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    request,
	}, nil
}

const gdataJSON = `{"gmetadata":[{"gid":2231376,"token":"a7584a5932","title":"标题","title_jpn":"",
"category":"Artist CG","thumb":"https://ehgt.org/x.webp","uploader":"Pokom","posted":"1653702810",
"filecount":"329","filesize":"419547090","expunged":false,"rating":"4.68","torrentcount":"4",
"tags":["artist:gentsuki"]}]}`

// 假 db：这条链路只会查凭据和阅读进度，两者都返回「没有这一行」即可。
type emptyDB struct{}

func (emptyDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (emptyDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, pgx.ErrNoRows
}

func (emptyDB) QueryRow(context.Context, string, ...any) pgx.Row { return emptyRow{} }

type emptyRow struct{}

func (emptyRow) Scan(...any) error { return pgx.ErrNoRows }
