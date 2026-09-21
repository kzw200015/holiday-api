package web

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

type keyword struct {
	Keyword string `json:"keyword"`
}

func call(router Router, method, path, body string) *httptest.ResponseRecorder {
	var request *http.Request
	if body == "" {
		// 调用方压根不发请求体，跟发了个空串不是一回事
		request = httptest.NewRequest(method, path, nil)
	} else {
		request = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

// PostNoBody 和 Post 的分界只有一条：要不要解请求体。
//
// 「清空」这类操作的调用方不发请求体，交给 Post 就会栽在 EOF 上回 400。
// 这里把它钉住，免得日后有人觉得 PostNoBody 只是替调用方少写一个 nil 而把两者并掉。
func TestPostNoBodyTakesNoRequestBody(t *testing.T) {
	cleared := false
	router := Routes(chi.NewRouter())
	router.PostNoBody("/clear", func(context.Context) (any, error) {
		cleared = true
		return nil, nil
	})
	router.Post("/remove", func(_ context.Context, body keyword) (any, error) {
		return body.Keyword, nil
	})

	response := call(router, http.MethodPost, "/clear", "")
	if response.Code != http.StatusOK || response.Body.String() != `{"code":200,"data":null,"msg":"OK"}`+"\n" {
		t.Fatalf("没有请求体的操作 = %d %s", response.Code, response.Body)
	}
	if !cleared {
		t.Fatal("用例没有被调用")
	}

	// 不解请求体不等于不能回数据：结果照样按统一契约写出去
	router.PostNoBody("/clear-all", func(context.Context) ([]string, error) {
		return []string{}, nil
	})
	if response := call(router, http.MethodPost, "/clear-all", ""); response.Code != http.StatusOK ||
		response.Body.String() != `{"code":200,"data":[],"msg":"OK"}`+"\n" {
		t.Fatalf("有返回值的操作 = %d %s", response.Code, response.Body)
	}

	// 同一个请求换成 Post 注册的路由就不行了，这正是 PostNoBody 存在的原因
	if response := call(router, http.MethodPost, "/remove", ""); response.Code != http.StatusBadRequest {
		t.Fatalf("Post 缺请求体 = %d %s", response.Code, response.Body)
	}
	if response := call(router, http.MethodPost, "/remove", `{"keyword":"猫"}`); response.Code != http.StatusOK ||
		response.Body.String() != `{"code":200,"data":"猫","msg":"OK"}`+"\n" {
		t.Fatalf("Post 带请求体 = %d %s", response.Code, response.Body)
	}
}

// 三个方法共用同一套响应契约：成功包成 Response，失败交给 Handler 翻译，
// 用例返回的错误不会被吞掉，也不会写出半个响应体。
func TestRouterResponseContract(t *testing.T) {
	router := Routes(chi.NewRouter())
	router.Get("/detail", func(r *http.Request) (keyword, error) {
		return keyword{Keyword: r.URL.Query().Get("q")}, nil
	})
	router.Get("/missing", func(*http.Request) (keyword, error) {
		return keyword{}, BadRequest("参数不对")
	})
	// 只关心成败的用例返回 nil，data 就是 null
	router.Post("/save", func(context.Context, keyword) (any, error) {
		return nil, nil
	})

	if response := call(router, http.MethodGet, "/detail?q=猫", ""); response.Code != http.StatusOK ||
		response.Body.String() != `{"code":200,"data":{"keyword":"猫"},"msg":"OK"}`+"\n" {
		t.Fatalf("读接口 = %d %s", response.Code, response.Body)
	}
	if response := call(router, http.MethodGet, "/missing", ""); response.Code != http.StatusBadRequest ||
		response.Body.String() != `{"code":400,"data":null,"msg":"参数不对"}`+"\n" {
		t.Fatalf("读接口报错 = %d %s", response.Code, response.Body)
	}
	if response := call(router, http.MethodPost, "/save", `{"keyword":"猫"}`); response.Code != http.StatusOK ||
		response.Body.String() != `{"code":200,"data":null,"msg":"OK"}`+"\n" {
		t.Fatalf("写接口 = %d %s", response.Code, response.Body)
	}
}
