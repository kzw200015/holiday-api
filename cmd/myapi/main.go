// MyAPI 提供节假日查询，是一个纯 API 服务。
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/kzw200015/myapi/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := app.Run(ctx); err != nil {
		slog.Error("服务退出", "err", err)
		os.Exit(1)
	}
}
