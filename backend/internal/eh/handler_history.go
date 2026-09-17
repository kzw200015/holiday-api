package eh

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"myapi/internal/auth"
	"myapi/internal/web"
)

func (h *Handler) historyRoutes(router chi.Router) {
	router.Method(http.MethodGet, "/history", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		page, err := h.service.ReadingHistory(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("cursor"))
		if err != nil {
			return err
		}
		return web.OK(w, page)
	}))
	router.Method(http.MethodPost, "/history/remove", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var body struct {
			GID int64 `json:"gid"`
		}
		if err := web.DecodeJSON(r, &body); err != nil {
			return err
		}
		if body.GID <= 0 {
			return web.BadRequest("图集编号不合法")
		}
		if err := h.service.RemoveReadingHistory(r.Context(), auth.UserID(r.Context()), body.GID); err != nil {
			return err
		}
		return web.OK(w, nil)
	}))
	router.Method(http.MethodPost, "/history/clear", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := h.service.ClearReadingHistory(r.Context(), auth.UserID(r.Context())); err != nil {
			return err
		}
		return web.OK(w, nil)
	}))
}
