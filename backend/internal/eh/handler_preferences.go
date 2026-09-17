package eh

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"myapi/internal/auth"
	"myapi/internal/web"
)

func (h *Handler) preferenceRoutes(router chi.Router) {
	router.Method(http.MethodGet, "/preferences", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		preferences, err := h.service.Preferences(r.Context(), auth.UserID(r.Context()))
		if err != nil {
			return err
		}
		return web.OK(w, preferences)
	}))

	router.Method(http.MethodPost, "/preferences/categories", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var body struct {
			Categories []string `json:"categories"`
		}
		if err := web.DecodeJSON(r, &body); err != nil {
			return err
		}
		if err := h.service.SaveCategories(r.Context(), auth.UserID(r.Context()), body.Categories); err != nil {
			return err
		}
		return web.OK(w, nil)
	}))

	router.Method(http.MethodPost, "/preferences/reader-interval", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var body struct {
			Interval int32 `json:"interval"`
		}
		if err := web.DecodeJSON(r, &body); err != nil {
			return err
		}
		if err := h.service.SaveReaderInterval(r.Context(), auth.UserID(r.Context()), body.Interval); err != nil {
			return err
		}
		return web.OK(w, nil)
	}))

	router.Method(http.MethodGet, "/search-history", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		history, err := h.service.SearchHistory(r.Context(), auth.UserID(r.Context()))
		if err != nil {
			return err
		}
		return web.OK(w, history)
	}))

	router.Method(http.MethodPost, "/search-history", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var body struct {
			Keyword string `json:"keyword"`
		}
		if err := web.DecodeJSON(r, &body); err != nil {
			return err
		}
		history, err := h.service.RecordSearch(r.Context(), auth.UserID(r.Context()), body.Keyword)
		if err != nil {
			return err
		}
		return web.OK(w, history)
	}))

	router.Method(http.MethodPost, "/search-history/remove", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var body struct {
			Keyword string `json:"keyword"`
		}
		if err := web.DecodeJSON(r, &body); err != nil {
			return err
		}
		history, err := h.service.RemoveSearch(r.Context(), auth.UserID(r.Context()), body.Keyword)
		if err != nil {
			return err
		}
		return web.OK(w, history)
	}))

	router.Method(http.MethodPost, "/search-history/clear", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := h.service.ClearSearchHistory(r.Context(), auth.UserID(r.Context())); err != nil {
			return err
		}
		return web.OK(w, nil)
	}))
}
