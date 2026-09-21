package eh

import (
	"context"
	"net/http"

	"myapi/internal/auth"
)

// 删一条阅读历史的请求体。按 gid 认记录，跟后端表里的约束一致。
type galleryIDBody struct {
	GID int64 `json:"gid"`
}

// saveProgress 记下读到第几页。
func (h *Handler) saveProgress(ctx context.Context, body ReadingPosition) (any, error) {
	return nil, h.service.SaveProgress(ctx, auth.UserID(ctx), body)
}

func (h *Handler) readingHistory(r *http.Request) (ReadingHistoryPage, error) {
	return h.service.ReadingHistory(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("cursor"))
}

func (h *Handler) removeReadingHistory(ctx context.Context, body galleryIDBody) (any, error) {
	return nil, h.service.RemoveReadingHistory(ctx, auth.UserID(ctx), body.GID)
}

func (h *Handler) clearReadingHistory(ctx context.Context) (any, error) {
	return nil, h.service.ClearReadingHistory(ctx, auth.UserID(ctx))
}
