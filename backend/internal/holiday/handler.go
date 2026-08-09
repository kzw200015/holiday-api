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
	group.GET("/detail", h.detail)
}

// isHoliday 处理 GET /is-holiday?date=YYYY-MM-DD，仅返回是否休息。
// 该接口有外部调用方，响应契约固定为 boolean，不要改动。
func (h *Handler) isHoliday(c *gin.Context) {
	date, ok := parseDateQuery(c)
	if !ok {
		return
	}

	result, err := h.service.Query(c.Request.Context(), date)
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, apiresponse.OK(result.IsOffDay))
}

// detail 处理 GET /detail?date=YYYY-MM-DD，返回是否休息及对应的节假日名称。
func (h *Handler) detail(c *gin.Context) {
	date, ok := parseDateQuery(c)
	if !ok {
		return
	}

	result, err := h.service.Query(c.Request.Context(), date)
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, apiresponse.OK(result))
}

// parseDateQuery 解析 date 查询参数，缺省时取当天。
// 返回 false 表示已写出参数错误响应，调用方应直接返回。
func parseDateQuery(c *gin.Context) (time.Time, bool) {
	dateStr := c.Query("date")
	if dateStr == "" {
		return time.Now(), true
	}
	// time.Parse 会拒绝 2024-02-31 等非法日期
	parsed, err := time.ParseInLocation(DateLayout, dateStr, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, apiresponse.BadRequest("日期格式错误，应为 YYYY-MM-DD"))
		return time.Time{}, false
	}
	return parsed, true
}
