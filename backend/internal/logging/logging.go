// Package logging 提供全局日志实例的初始化。
package logging

import (
	"log/slog"
	"os"
)

// Setup 初始化并返回全局日志实例，统一输出 JSON 便于日志采集。
func Setup() *slog.Logger {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	// 设为默认实例，使未显式传入 logger 的位置也能输出到同一目标
	slog.SetDefault(logger)
	return logger
}
