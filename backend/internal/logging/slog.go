package logging

import (
	"log/slog"
	"os"

	ginslog "github.com/gin-contrib/slog"
	"github.com/gin-gonic/gin"
)

// InitSlog 初始化全局 slog，并开启源码位置信息输出（含行号）。
func InitSlog() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level:     slog.LevelInfo,
		AddSource: true,
	}))
	slog.SetDefault(logger)
}

// GinLogger 返回基于 gin-contrib/slog 的 Gin 请求日志中间件。
func GinLogger() gin.HandlerFunc {
	return ginslog.SetLogger(
		ginslog.WithLogger(func(_ *gin.Context, _ *slog.Logger) *slog.Logger {
			return slog.Default()
		}),
	)
}
