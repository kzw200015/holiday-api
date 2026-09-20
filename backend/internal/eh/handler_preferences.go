package eh

import (
	"context"
	"net/http"

	"myapi/internal/auth"
	"myapi/internal/web"
)

// 搜索历史的请求体。偏好直接收 Preferences 本身，读写两头是同一个形状。
type searchHistoryBody struct {
	Entries []string `json:"entries"`
}

// 偏好与搜索历史都是「读一次、之后前端说了算」的账号数据，所以写入一律是整份 PUT：
// 前端推上来的就是它当前的样子，这边存住即可，不必再从一串动作里算结果。
// 两个写接口只回成败：前端以本地那份为准，不需要存下来的结果。
func (h *Handler) preferenceRoutes(router web.Router) {
	router.Get("/preferences", func(r *http.Request) (Preferences, error) {
		return h.service.Preferences(r.Context(), auth.UserID(r.Context()))
	})
	router.Put("/preferences", func(ctx context.Context, body Preferences) (any, error) {
		return nil, h.service.SavePreferences(ctx, auth.UserID(ctx), body)
	})

	router.Get("/search-history", func(r *http.Request) ([]string, error) {
		return h.service.SearchHistory(r.Context(), auth.UserID(r.Context()))
	})
	router.Put("/search-history", func(ctx context.Context, body searchHistoryBody) (any, error) {
		return nil, h.service.SaveSearchHistory(ctx, auth.UserID(ctx), body.Entries)
	})
}
