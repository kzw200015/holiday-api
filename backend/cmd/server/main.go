// Command server 是后端服务入口。
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"myapi/internal/config"
	"myapi/internal/database"
	"myapi/internal/holiday"
	"myapi/internal/logging"
	"myapi/internal/server"
)

func main() {
	if err := run(); err != nil {
		slog.Error("服务启动失败", slog.Any("error", err))
		os.Exit(1)
	}
}

func run() error {
	// 开发环境从 .env 加载环境变量，文件不存在时忽略
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := logging.Setup()

	// 监听中断信号，用于优雅关闭
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Connect(ctx, cfg.DBURL)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	holidayService := holiday.NewService(holiday.NewRepository(db), holiday.NewRemoteClient(), logger)
	holidayHandler := holiday.NewHandler(holidayService)

	// 启动初始化：刷新当年和下一年节假日数据
	if err := holidayService.InitCurrentAndNextYear(ctx); err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", config.Port),
		Handler:           server.New(logger, holidayHandler),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// 在独立 goroutine 中监听，主流程等待退出信号
	serverErr := make(chan error, 1)
	go func() {
		logger.Info(fmt.Sprintf("服务已启动: http://localhost:%d", config.Port))
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		logger.Info("收到退出信号，正在关闭服务")
	}

	// 优雅关闭：等待进行中的请求完成
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("关闭服务失败: %w", err)
	}
	return nil
}
