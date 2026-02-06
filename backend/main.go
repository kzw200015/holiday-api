package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	dateLayout = "2006-01-02"
	baseURL    = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"
)

type apiResponse[T any] struct {
	Code int    `json:"code"`
	Data T      `json:"data"`
	Msg  string `json:"msg"`
}

type holiday struct {
	Name     string `json:"name"`
	Date     string `json:"date"`
	IsOffDay bool   `json:"isOffDay"`
}

type holidayJSON struct {
	Days []holiday `json:"days"`
}

type holidayService struct {
	byDate map[string]holiday
}

func newHolidayService() (*holidayService, error) {
	today := time.Now()
	currentYear := today.Year()
	nextYear := currentYear + 1

	byDate := make(map[string]holiday)
	for _, year := range []int{currentYear, nextYear} {
		days, err := fetchYearDays(year)
		if err != nil {
			return nil, err
		}
		for _, day := range days {
			byDate[day.Date] = day
		}
	}
	return &holidayService{byDate: byDate}, nil
}

func (s *holidayService) isHoliday(date time.Time) bool {
	dateText := date.Format(dateLayout)
	if day, ok := s.byDate[dateText]; ok {
		return day.IsOffDay
	}
	weekDay := date.Weekday()
	return weekDay == time.Saturday || weekDay == time.Sunday
}

func fetchYearDays(year int) ([]holiday, error) {
	requestURL := fmt.Sprintf("%s/%d.json", baseURL, year)
	response, err := http.Get(requestURL)
	if err != nil {
		return nil, fmt.Errorf("请求假期数据失败: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("请求假期数据失败: status=%d", response.StatusCode)
	}

	var payload holidayJSON
	if err = json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("解析假期数据失败: %w", err)
	}
	return payload.Days, nil
}

func main() {
	service, err := newHolidayService()
	if err != nil {
		panic(err)
	}

	router := gin.Default()
	router.GET("/api/holiday/is-holiday", func(c *gin.Context) {
		dateParam := c.Query("date")

		var date time.Time
		if dateParam == "" {
			date = time.Now()
		} else {
			parsed, parseErr := time.ParseInLocation(dateLayout, dateParam, time.Local)
			if parseErr != nil {
				c.JSON(http.StatusBadRequest, apiResponse[any]{
					Code: http.StatusBadRequest,
					Data: nil,
					Msg:  "date 参数格式错误，应为 yyyy-MM-dd",
				})
				return
			}
			date = parsed
		}

		c.JSON(http.StatusOK, apiResponse[bool]{
			Code: http.StatusOK,
			Data: service.isHoliday(date),
			Msg:  http.StatusText(http.StatusOK),
		})
	})

	if err = router.Run(":8000"); err != nil {
		panic(err)
	}
}
