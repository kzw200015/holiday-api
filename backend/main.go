package main

import (
	"time"

	"myapi/internal/holiday"
	"myapi/internal/httpapi"

	"github.com/gin-gonic/gin"
)

func main() {
	service, err := holiday.NewService(time.Now())
	if err != nil {
		panic(err)
	}

	router := gin.Default()
	httpapi.NewHolidayHandler(service).Register(router)
	httpapi.RegisterFrontend(router)

	if err = router.Run(":8000"); err != nil {
		panic(err)
	}
}
