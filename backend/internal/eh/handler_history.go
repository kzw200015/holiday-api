package eh

import (
	"context"
	"net/http"

	"myapi/internal/auth"
)

// saveProgress 记下读到第几页。
func (h *Handler) saveProgress(ctx context.Context, body ReadingPosition) (any, error) {
	return nil, h.service.SaveProgress(ctx, auth.UserID(ctx), body)
}

func (h *Handler) readingHistory(r *http.Request) (ReadingHistoryPage, error) {
	return h.service.ReadingHistory(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("cursor"))
}

// removeReadingHistory 按 gid 认记录，跟后端表里的约束一致。
func (h *Handler) removeReadingHistory(r *http.Request) (any, error) {
	return nil, h.service.RemoveReadingHistory(r.Context(), auth.UserID(r.Context()), gidOf(r))
}

func (h *Handler) clearReadingHistory(r *http.Request) (any, error) {
	return nil, h.service.ClearReadingHistory(r.Context(), auth.UserID(r.Context()))
}
