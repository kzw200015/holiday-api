package holiday

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
)

// dayBody 是 detail 接口的响应体。
type dayBody struct {
	// Date 写成 YYYY-MM-DD
	Date     string `json:"date"`
	IsOffDay bool   `json:"isOffDay"`
	Name     string `json:"name"`
}

// Routes 挂上节假日的两条接口。调用方是自己的其他程序：路径与成功时的响应体改了，要同步改调用方。
//
// `date` 是要查的那一天，写成 YYYY-MM-DD，省略或留空表示北京时间的今天；写错回 400。
func Routes(group *echo.Group, service *Service) {
	// 只回这天是不是休息日，响应体就是一个 JSON 布尔值
	group.GET("/is-holiday", func(c *echo.Context) error {
		day, err := queriedDay(c, service)
		if err != nil {
			return err
		}
		return c.JSON(http.StatusOK, day.IsOffDay)
	})
	// 是不是休息日，外加对应的节假日名称
	group.GET("/detail", func(c *echo.Context) error {
		day, err := queriedDay(c, service)
		if err != nil {
			return err
		}
		return c.JSON(http.StatusOK, dayBody{Date: day.Date.Format(time.DateOnly), IsOffDay: day.IsOffDay, Name: day.Name})
	})
}

// queriedDay 是 `date` 参数指的那一天是不是休息日。
func queriedDay(c *echo.Context, service *Service) (Day, error) {
	var date time.Time
	if err := echo.QueryParamsBinder(c).Time("date", &date, time.DateOnly).BindError(); err != nil {
		return Day{}, err
	}
	if date.IsZero() {
		date = Today()
	}
	return service.Day(c.Request().Context(), date)
}
