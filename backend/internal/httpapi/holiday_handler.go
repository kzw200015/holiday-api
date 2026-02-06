package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"myapi/internal/holiday"
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
}

func (h *HolidayHandler) handleIsHoliday(c *gin.Context) {
	dateParam := c.Query("date")

	var date time.Time
	if dateParam == "" {
		date = time.Now()
	} else {
		parsed, parseErr := time.ParseInLocation(holiday.DateLayout, dateParam, time.Local)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, ApiResponse[any]{
				Code: http.StatusBadRequest,
				Data: nil,
				Msg:  "date 参数格式错误，应为 yyyy-MM-dd",
			})
			return
		}
		date = parsed
	}

	c.JSON(http.StatusOK, ApiResponse[bool]{
		Code: http.StatusOK,
		Data: h.service.IsHoliday(date),
		Msg:  http.StatusText(http.StatusOK),
	})
}
