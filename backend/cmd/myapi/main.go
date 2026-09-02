// myapi 的入口。装配全在 wire 图里（见 wire.go），这里只负责跑起来和停下来。
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
	// 时区数据编进二进制，运行镜像里就不用装 tzdata；容器里用 TZ 环境变量指定时区
	_ "time/tzdata"
)

func main() {
	if err := run(); err != nil {
		slog.Error("启动失败", "err", err)
		os.Exit(1)
	}
}

func run() error {
	// 收到 SIGINT / SIGTERM 就取消这个 ctx，下面的定时刷新和 HTTP 服务都挂在它上面
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 读配置、建日志器、连库建表、把各层 new 出来，任一步失败即退出，
	// 不带着不完整的状态对外服务
	application, cleanup, err := initApplication(ctx)
	if err != nil {
		return err
	}
	defer cleanup()

	// 先刷新当年和次年的数据再监听端口：拉不到就别对外服务，免得接口一直回错误答案
	if err := application.Holiday.RefreshUpcomingYears(ctx); err != nil {
		return err
	}
	go application.Holiday.StartRefreshLoop(ctx, application.Config.Holiday.RefreshInterval)

	return serve(ctx, application.Config.Port, application.Router)
}

func serve(ctx context.Context, port int, handler http.Handler) error {
	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: handler,
		// 刻意不设 WriteTimeout：从慢的 H@H 节点流式转发一张大图可能要几十秒，
		// 设了就会在传到一半时被掐断。慢速攻击由 ReadHeaderTimeout 挡
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// 收到退出信号后给在途请求 10 秒收尾，正在传的图片不至于半途断掉
	shutdown := make(chan error, 1)
	go func() {
		<-ctx.Done()
		graceful, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		shutdown <- server.Shutdown(graceful)
	}()

	slog.Info("myapi 已启动", "port", port)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return <-shutdown
}
