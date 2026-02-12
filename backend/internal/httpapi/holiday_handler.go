package httpapi

import (
	"net/http"
	"time"

	"myapi/internal/holiday"

	"github.com/gin-gonic/gin"
)

// HolidayHandler 负责节假日HTTP接口。
type HolidayHandler struct {
	service *holiday.Service
}

func NewHolidayHandler(service *holiday.Service) *HolidayHandler {
	return &HolidayHandler{service: service}
}

func (h *HolidayHandler) Register(router *gin.Engine) {
	router.GET("/api/holiday/is-holiday", h.handleIsHoliday)
	router.GET("/api/holiday/next-off-day", h.handleNextOffDay)
}

func (h *HolidayHandler) handleIsHoliday(c *gin.Context) {
	dateParam := c.Query("date")

	var date time.Time
	if dateParam == "" {
		date = time.Now()
	} else {
		parsed, parseErr := time.ParseInLocation(holiday.DateLayout, dateParam, time.Local)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, BadRequest("date 参数格式错误，应为 yyyy-MM-dd"))
			return
		}
		date = parsed
	}

	isHoliday, err := h.service.IsHoliday(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("查询节假日失败"))
		return
	}

	c.JSON(http.StatusOK, Ok(isHoliday))
}

func (h *HolidayHandler) handleNextOffDay(c *gin.Context) {
	dateParam := c.Query("date")

	var date time.Time
	if dateParam == "" {
		date = time.Now()
	} else {
		parsed, parseErr := time.ParseInLocation(holiday.DateLayout, dateParam, time.Local)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, BadRequest("date 参数格式错误，应为 yyyy-MM-dd"))
			return
		}
		date = parsed
	}

	nextOffDay, err := h.service.QueryNextOffDay(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("查询节假日失败"))
		return
	}

	c.JSON(http.StatusOK, Ok(nextOffDay))
}
