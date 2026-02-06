package main

import (
	"time"

	"github.com/gin-gonic/gin"
	"myapi/internal/holiday"
	"myapi/internal/httpapi"
)

func main() {
	service, err := holiday.NewService(time.Now())
	if err != nil {
		panic(err)
	}

	router := gin.Default()
	httpapi.NewHolidayHandler(service).Register(router)

	if err = router.Run(":8000"); err != nil {
		panic(err)
	}
}
