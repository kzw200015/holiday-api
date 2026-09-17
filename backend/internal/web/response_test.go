package web

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"myapi/internal/apperr"
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

	t.Run("业务错误的 Msg 原样回、Err 不回", func(t *testing.T) {
		handler := Handler(func(http.ResponseWriter, *http.Request) error {
			return apperr.New(apperr.UpstreamFailure, "上游没响应").WithCause(errors.New("dial tcp: i/o timeout"))
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

func TestBusinessErrorMapping(t *testing.T) {
	cases := []struct {
		name   string
		kind   apperr.Kind
		status int
	}{
		{"参数无效", apperr.InvalidArgument, 400},
		{"未认证", apperr.Unauthenticated, 401},
		{"许可失效", apperr.PermissionDenied, 403},
		{"资源不存在", apperr.NotFound, 404},
		{"配额耗尽", apperr.ResourceExhausted, 429},
		{"上游故障", apperr.UpstreamFailure, 502},
		{"零值种类不泄露文案", "", 500},
		{"未登记种类不泄露文案", "unknown", 500},
	}
	for _, each := range cases {
		t.Run(each.name, func(t *testing.T) {
			cause := errors.New("内部诊断信息")
			err := fmt.Errorf("用例上下文: %w", apperr.New(each.kind, "业务提示").WithCause(cause))
			if !errors.Is(err, cause) {
				t.Fatal("包装后丢失原始原因")
			}
			response := serve(Handler(func(http.ResponseWriter, *http.Request) error {
				return err
			}), context.Background())
			msg := "业务提示"
			if each.status == 500 {
				msg = "服务器内部错误"
			}
			want := fmt.Sprintf("{\"code\":%d,\"data\":null,\"msg\":%q}\n", each.status, msg)
			if response.Code != each.status || response.Body.String() != want {
				t.Fatalf("响应 = %d %s，期望 %d %s", response.Code, response.Body, each.status, want)
			}
		})
	}
}

func serve(handler http.Handler, ctx context.Context) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, "/api/x", nil).WithContext(ctx)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}
