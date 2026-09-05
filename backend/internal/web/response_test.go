package web

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// 错误翻译是所有接口共用的出口，这里锁的是三条对外契约：
// 没预料到的错误只回固定文案（原文可能带表名、路径）、panic 也要按统一结构回 JSON 500、
// 客户端已经断开时不再往日志里灌故障。
func TestHandlerErrorContract(t *testing.T) {
	t.Run("没预料到的错误不把原文回给客户端", func(t *testing.T) {
		handler := Handler(func(http.ResponseWriter, *http.Request) error {
			return errors.New(`relation "users" does not exist`)
		})
		response := serve(handler, context.Background())
		if response.Code != http.StatusInternalServerError ||
			response.Body.String() != `{"code":500,"data":null,"msg":"服务器内部错误"}`+"\n" {
			t.Errorf("500 = %d %s", response.Code, response.Body)
		}
	})

	t.Run("web.Error 的 Msg 原样回、Err 不回", func(t *testing.T) {
		handler := Handler(func(http.ResponseWriter, *http.Request) error {
			return Fail(http.StatusBadGateway, "上游没响应").WithCause(errors.New("dial tcp: i/o timeout"))
		})
		response := serve(handler, context.Background())
		if response.Code != http.StatusBadGateway || strings.Contains(response.Body.String(), "dial tcp") ||
			!strings.Contains(response.Body.String(), "上游没响应") {
			t.Errorf("502 = %d %s", response.Code, response.Body)
		}
	})

	t.Run("panic 按统一结构回 JSON 500", func(t *testing.T) {
		handler := Recover(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
		response := serve(handler, context.Background())
		if response.Code != http.StatusInternalServerError ||
			response.Body.String() != `{"code":500,"data":null,"msg":"服务器内部错误"}`+"\n" {
			t.Errorf("panic = %d %s", response.Code, response.Body)
		}
	})

	t.Run("客户端已断开就什么都不写", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		handler := Handler(func(http.ResponseWriter, *http.Request) error {
			return errors.New("context canceled")
		})
		if response := serve(handler, ctx); response.Body.Len() != 0 {
			t.Errorf("断开后仍写了响应体: %s", response.Body)
		}
	})
}

func serve(handler http.Handler, ctx context.Context) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, "/api/x", nil).WithContext(ctx)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}
