// Package app 组装并启动整个服务。
//
// 部件的构造交给 wire（wire.go 声明，wire_gen.go 是生成的实现），启动与关停的顺序写在 [Run] 里。
package app

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/labstack/echo/v5"
	"golang.org/x/sync/errgroup"

	"github.com/kzw200015/myapi/internal/config"
	"github.com/kzw200015/myapi/internal/holiday"
)

// app 是组装好的服务，字段由 wire 填。
type app struct {
	refresher *holiday.Refresher
	server    *echo.Echo
}

// Run 从环境变量读出配置，启动服务，直到 ctx 取消后关停。
func Run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel})))
	return run(ctx, cfg)
}

// run 按 cfg 组装并启动服务，直到 ctx 取消后关停。生产与集成测试都经它启动。
//
// 迁移（组装时 database.NewPool 做的）与启动时的节假日刷新都做完才开始监听；启动时出错就返回，进程拒绝启动。
// 收到 SIGTERM 时不再接新请求，最多等 10 秒让进行中的处理完，后台刷新随之取消。
func run(ctx context.Context, cfg config.Config) error {
	a, cleanup, err := initApp(ctx, cfg)
	if err != nil {
		return err
	}
	defer cleanup()
	pending, err := a.refresher.Startup(ctx)
	if err != nil {
		return err
	}

	tasks, ctx := errgroup.WithContext(ctx)
	tasks.Go(func() error {
		a.refresher.Run(ctx, pending)
		return nil
	})
	tasks.Go(func() error {
		start := echo.StartConfig{
			Address:    fmt.Sprintf(":%d", cfg.Port),
			HideBanner: true,
			HidePort:   true,
			BeforeServeFunc: func(server *http.Server) error {
				server.ReadHeaderTimeout = 10 * time.Second
				return nil
			},
			ListenerAddrFunc: func(addr net.Addr) { slog.Info("开始监听", "addr", addr) },
			OnShutdownError:  func(err error) { slog.Error("关停时还有请求没处理完", "err", err) },
		}
		if err := start.Start(ctx, a.server); err != nil {
			return fmt.Errorf("监听 %d 端口失败: %w", cfg.Port, err)
		}
		return nil
	})
	return tasks.Wait()
}
