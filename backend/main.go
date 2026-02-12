package main

import (
	"context"
	"os"
	"time"

	"myapi/internal/ent"
	"myapi/internal/holiday"
	"myapi/internal/httpapi"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		panic("DATABASE_URL 未设置")
	}

	client, err := ent.Open("postgres", databaseURL)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	if err = client.Schema.Create(context.Background()); err != nil {
		panic(err)
	}

	service, err := holiday.NewService(time.Now(), client)
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
