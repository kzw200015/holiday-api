package holiday

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"myapi/internal/apiresponse"
)

// Handler 处理节假日相关的 HTTP 请求。
type Handler struct {
	service *Service
}

// NewHandler 创建 HTTP 处理器。
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes 将节假日路由注册到指定路由组。
func (h *Handler) RegisterRoutes(group *gin.RouterGroup) {
	group.GET("/is-holiday", h.isHoliday)
}

// isHoliday 处理 GET /is-holiday?date=YYYY-MM-DD
func (h *Handler) isHoliday(c *gin.Context) {
	dateStr := c.Query("date")
	date := time.Now()
	if dateStr != "" {
		// time.Parse 会拒绝 2024-02-31 等非法日期
		parsed, err := time.ParseInLocation(DateLayout, dateStr, time.Local)
		if err != nil {
			c.JSON(http.StatusBadRequest, apiresponse.BadRequest("日期格式错误，应为 YYYY-MM-DD"))
			return
		}
		date = parsed
	}

	result, err := h.service.IsHoliday(c.Request.Context(), date)
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, apiresponse.OK(result))
}
