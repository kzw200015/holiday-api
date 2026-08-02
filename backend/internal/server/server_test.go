package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"myapi/internal/holiday"
)

func TestRouting(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := holiday.NewHandler(holiday.NewService(holiday.NewRepository(nil), holiday.NewRemoteClient(), logger))
	engine := New(logger, h)

	cases := []struct {
		path string
		code int
		body string
	}{
		{"/api/holiday/is-holiday?date=2024-02-31", 400, `{"code":400,"data":null,"msg":"日期格式错误，应为 YYYY-MM-DD"}`},
		{"/api/holiday/is-holiday?date=abc", 400, `{"code":400,"data":null,"msg":"日期格式错误，应为 YYYY-MM-DD"}`},
		{"/api/unknown", 404, `{"code":404,"data":null,"msg":"Not Found"}`},
		{"/api", 404, `{"code":404,"data":null,"msg":"Not Found"}`},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, c.path, nil))
		if w.Code != c.code || w.Body.String() != c.body {
			t.Errorf("%s => %d %s", c.path, w.Code, w.Body.String())
		}
	}
}
