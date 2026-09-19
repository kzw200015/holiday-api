package eh

import (
	"context"
	"net/http"

	"myapi/internal/auth"
	"myapi/internal/web"
)

// 偏好与搜索历史的请求体。两个搜索历史接口收的是同一样东西，用同一个类型，
// 免得改字段名时只改了一半。
type (
	categoriesBody struct {
		Categories []string `json:"categories"`
	}
	intervalBody struct {
		Interval int32 `json:"interval"`
	}
	keywordBody struct {
		Keyword string `json:"keyword"`
	}
)

func (h *Handler) preferenceRoutes(router web.Router) {
	router.Get("/preferences", func(r *http.Request) (Preferences, error) {
		return h.service.Preferences(r.Context(), auth.UserID(r.Context()))
	})
	router.Post("/preferences/categories", func(ctx context.Context, body categoriesBody) (any, error) {
		return nil, h.service.SaveCategories(ctx, auth.UserID(ctx), body.Categories)
	})
	router.Post("/preferences/reader-interval", func(ctx context.Context, body intervalBody) (any, error) {
		return nil, h.service.SaveReaderInterval(ctx, auth.UserID(ctx), body.Interval)
	})

	router.Get("/search-history", func(r *http.Request) ([]string, error) {
		return h.service.SearchHistory(r.Context(), auth.UserID(r.Context()))
	})
	// 记一条和删一条都回整份历史，前端不必自己拼。
	router.Post("/search-history", func(ctx context.Context, body keywordBody) ([]string, error) {
		return h.service.RecordSearch(ctx, auth.UserID(ctx), body.Keyword)
	})
	router.Post("/search-history/remove", func(ctx context.Context, body keywordBody) ([]string, error) {
		return h.service.RemoveSearch(ctx, auth.UserID(ctx), body.Keyword)
	})
	router.Action("/search-history/clear", func(ctx context.Context) ([]string, error) {
		return h.service.ClearSearchHistory(ctx, auth.UserID(ctx))
	})
}
