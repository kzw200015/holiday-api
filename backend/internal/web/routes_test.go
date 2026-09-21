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

// Delete 和 Get 一样不解请求体：删的是哪一个写在路径上，调用方压根不发请求体。
//
// 这里把它钉住，免得日后有人觉得 Delete 也是写入、顺手让它和 Post、Put 一样走 withBody，
// 那样所有删除都会栽在 EOF 上回 400。
func TestDeleteTakesNoRequestBody(t *testing.T) {
	router := Routes(chi.NewRouter())
	router.Delete("/items/{id}", func(r *http.Request) (string, error) {
		return chi.URLParam(r, "id"), nil
	})
	// 只关心成败的用例返回 nil，data 就是 null
	router.Delete("/items", func(*http.Request) (any, error) {
		return nil, nil
	})

	if response := call(router, http.MethodDelete, "/items/42", ""); response.Code != http.StatusOK ||
		response.Body.String() != `{"code":200,"data":"42","msg":"OK"}`+"\n" {
		t.Fatalf("删一个 = %d %s", response.Code, response.Body)
	}
	if response := call(router, http.MethodDelete, "/items", ""); response.Code != http.StatusOK ||
		response.Body.String() != `{"code":200,"data":null,"msg":"OK"}`+"\n" {
		t.Fatalf("删全部 = %d %s", response.Code, response.Body)
	}
}

// 各个方法共用同一套响应契约：成功包成 Response，失败交给 Handler 翻译，
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
