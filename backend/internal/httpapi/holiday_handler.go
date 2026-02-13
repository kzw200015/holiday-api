package httpapi

import (
	"net/http"
	"time"

	"myapi/internal/holiday"

	"github.com/gin-gonic/gin"
)

// parseHolidayDateOrNow 解析 date 参数（yyyy-MM-dd）；若为空则返回当前时间。
func parseHolidayDateOrNow(dateParam string) (time.Time, error) {
	if dateParam == "" {
		return time.Now(), nil
	}
	return time.ParseInLocation(holiday.DateLayout, dateParam, time.Local)
}

// HolidayHandler 负责节假日HTTP接口。
type HolidayHandler struct {
	service *holiday.Service
}

// NewHolidayHandler 创建节假日接口处理器。
func NewHolidayHandler(service *holiday.Service) *HolidayHandler {
	return &HolidayHandler{service: service}
}

// Register 注册节假日相关路由。
func (h *HolidayHandler) Register(router *gin.Engine) {
	router.GET("/api/holiday/is-holiday", h.handleIsHoliday)
	router.GET("/api/holiday/next-off-day", h.handleNextOffDay)
}

// handleIsHoliday 判断指定日期是否为休息日。
func (h *HolidayHandler) handleIsHoliday(c *gin.Context) {
	dateParam := c.Query("date")

	date, err := parseHolidayDateOrNow(dateParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, BadRequest("date 参数格式错误，应为 yyyy-MM-dd"))
		return
	}

	isHoliday, err := h.service.IsHoliday(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("查询节假日失败"))
		return
	}

	c.JSON(http.StatusOK, Ok(isHoliday))
}

// handleNextOffDay 查询从指定日期开始的下一个休息日。
func (h *HolidayHandler) handleNextOffDay(c *gin.Context) {
	dateParam := c.Query("date")

	date, err := parseHolidayDateOrNow(dateParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, BadRequest("date 参数格式错误，应为 yyyy-MM-dd"))
		return
	}

	nextOffDay, err := h.service.QueryNextOffDay(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("查询节假日失败"))
		return
	}

	c.JSON(http.StatusOK, Ok(nextOffDay))
}
