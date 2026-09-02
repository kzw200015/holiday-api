package holiday

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"myapi/internal/web"
)

// Routes 挂在 /api/holiday 下。
func Routes(service *Service) http.Handler {
	router := chi.NewRouter()

	query := func(r *http.Request) (Day, error) {
		date, err := parseDateParam(r.URL.Query().Get("date"))
		if err != nil {
			return Day{}, err
		}
		return service.Query(r.Context(), date)
	}

	// GET /api/holiday/is-holiday?date=YYYY-MM-DD，仅返回是否休息。
	// 该接口有外部调用方，响应契约固定为 boolean，不要改动
	router.Method(http.MethodGet, "/is-holiday", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		day, err := query(r)
		if err != nil {
			return err
		}
		return web.OK(w, day.IsOffDay)
	}))

	// GET /api/holiday/detail?date=YYYY-MM-DD，返回是否休息及对应的节假日名称
	router.Method(http.MethodGet, "/detail", web.Handler(func(w http.ResponseWriter, r *http.Request) error {
		day, err := query(r)
		if err != nil {
			return err
		}
		return web.OK(w, day)
	}))

	return router
}

// date 参数：省略或空串取当天，否则必须是合法的 YYYY-MM-DD。
// 失败文案是接口契约的一部分，前端和外部调用方都按它显示，别改。
func parseDateParam(text string) (time.Time, error) {
	if text == "" {
		return time.Now(), nil
	}
	date, err := time.Parse(time.DateOnly, text)
	if err != nil {
		return time.Time{}, web.BadRequest("日期格式错误，应为 YYYY-MM-DD")
	}
	return date, nil
}
