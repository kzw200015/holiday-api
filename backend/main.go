package main

import (
	"context"
	"fmt"
	"os"

	"myapi/internal/codex"
	"myapi/internal/codexproxy"
	"myapi/internal/ent"
	"myapi/internal/holiday"
	"myapi/internal/httpapi"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

func openDatabaseClient(ctx context.Context) (*ent.Client, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL 未设置")
	}

	client, err := ent.Open("postgres", databaseURL)
	if err != nil {
		return nil, err
	}

	if err = client.Schema.Create(ctx); err != nil {
		client.Close()
		return nil, err
	}
	return client, nil
}

func main() {
	client, err := openDatabaseClient(context.Background())
	if err != nil {
		panic(err)
	}
	defer client.Close()

	service, err := holiday.NewService(client)
	if err != nil {
		panic(err)
	}

	codexService := codex.NewService(client)
	codexProxyService := codexproxy.NewService(client)

	router := gin.Default()
	httpapi.NewHolidayHandler(service).Register(router)
	httpapi.NewCodexHandler(codexService, codexProxyService).Register(router)
	httpapi.RegisterFrontend(router)

	if err = router.Run(":8000"); err != nil {
		panic(err)
	}
}
