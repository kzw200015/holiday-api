package eh

import (
	"context"
	"net/http"

	"myapi/internal/auth"
	"myapi/internal/web"
)

// 删一条阅读历史的请求体。按 gid 认记录，跟后端表里的约束一致。
type galleryIDBody struct {
	GID int64 `json:"gid"`
}

func (h *Handler) historyRoutes(router web.Router) {
	router.Get("/history", func(r *http.Request) (ReadingHistoryPage, error) {
		return h.service.ReadingHistory(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("cursor"))
	})
	router.Post("/history/remove", func(ctx context.Context, body galleryIDBody) (any, error) {
		return nil, h.service.RemoveReadingHistory(ctx, auth.UserID(ctx), body.GID)
	})
	router.Action("/history/clear", func(ctx context.Context) (any, error) {
		return nil, h.service.ClearReadingHistory(ctx, auth.UserID(ctx))
	})
}
