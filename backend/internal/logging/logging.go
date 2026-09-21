// Package logging 建进程级日志器。
//
// 记日志的约定：结构化字段成对写在消息后面，错误统一用 err 键。
package logging

import (
	"log/slog"
	"os"

	"myapi/internal/config"
)

// Setup 建好进程级日志器并**设成 slog 的默认值**，其余各包直接调 slog.Info 就用它。
//
// 返回值不是给谁存着的，而是让 wire 能把它排进依赖图：store.NewPool 收这个参数，
// 于是「日志先就绪、再连库」这个顺序由依赖关系保证，而不是靠 main 里的语句先后。
func Setup(cfg config.Log) *slog.Logger {
	options := &slog.HandlerOptions{Level: parseLevel(cfg.Level)}

	var handler slog.Handler = slog.NewJSONHandler(os.Stdout, options)
	if cfg.Format == "text" {
		handler = slog.NewTextHandler(os.Stdout, options)
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

// 级别名在 config.Load 里已经校验过，这里解析不会失败；万一失败也只是退回 info。
func parseLevel(name string) slog.Level {
	var level slog.Level
	if err := level.UnmarshalText([]byte(name)); err != nil {
		return slog.LevelInfo
	}
	return level
}
