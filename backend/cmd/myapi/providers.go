package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"myapi/internal/auth"
	"myapi/internal/config"
	"myapi/internal/eh"
	"myapi/internal/holiday"
	"myapi/internal/signing"
	"myapi/internal/store"
)

// application 是 wire 组装出来的成品：一个可以挂到 http.Server 上的 handler、
// 需要在启动时和后台被主动调用的节假日服务，外加 main 自己要用的那几项配置。
type application struct {
	Config  config.Config
	Router  http.Handler
	Holiday *holiday.Service
}

// provideLogger 建好进程级日志器并**设成 slog 的默认值**，其余各包直接调 slog.Info 就用它。
//
// 返回值不是给谁存着的，而是让 wire 能把它排进依赖图：下面 provideDatabase 收这个参数，
// 于是「日志先就绪、再连库」这个顺序由依赖关系保证，而不是靠 main 里的语句先后。
//
// 记日志的约定：结构化字段成对写在消息后面，错误统一用 err 键。
func provideLogger(cfg config.Config) *slog.Logger {
	options := &slog.HandlerOptions{Level: parseLevel(cfg.Log.Level)}

	var handler slog.Handler = slog.NewJSONHandler(os.Stdout, options)
	if cfg.Log.Format == "text" {
		handler = slog.NewTextHandler(os.Stdout, options)
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

func parseLevel(name string) slog.Level {
	var level slog.Level
	if err := level.UnmarshalText([]byte(strings.ToUpper(name))); err != nil {
		return slog.LevelInfo
	}
	return level
}

// provideDatabase 建连接池。表结构由人工维护，进程不碰 DDL，见 internal/store/schema.sql。
//
// 第二个返回值是 wire 的 cleanup：它会被串进 injector 交出来的那一个 cleanup 里，
// 后面哪个 provider 失败了也会被调到，所以连接池不会漏。
func provideDatabase(ctx context.Context, cfg config.Config, logger *slog.Logger) (*pgxpool.Pool, func(), error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.Database.URL)
	if err != nil {
		return nil, nil, fmt.Errorf("数据库连接串解析失败: %w", err)
	}
	poolConfig.MaxConns = cfg.Database.MaxConns
	poolConfig.MaxConnLifetime = cfg.Database.MaxConnLifetime

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, nil, err
	}

	// 池是惰性建连的，这里还没真连上库；连不通会在启动时那次节假日刷新暴露出来
	logger.Info("数据库连接池已就绪", "maxConns", poolConfig.MaxConns)

	return pool, pool.Close, nil
}

// 两把子密钥都在这里派生，摆在一起才看得出有没有谁直接拿了裸主密钥。
// 用途标签是密钥的一部分，改标签等于换密钥——已签发的令牌和已发出去的图片地址会一起失效。

func provideTokens(cfg config.Config) *auth.Tokens {
	return auth.NewTokens(signing.DeriveSecret(cfg.Security.SecretKey, "jwt-v1"), cfg.Security.TokenTTL)
}

func provideAttachmentSigner(cfg config.Config) *signing.AttachmentSigner {
	return signing.NewAttachmentSigner(
		signing.DeriveSecret(cfg.Security.SecretKey, "attachment-v1"), cfg.Security.AttachmentTTL)
}

// 下面两个只是把 config 里的字段挑出来喂给构造器，
// 好让各业务包的构造器只声明自己真正用得上的东西，也不必认识 config。

func provideEhClient(cfg config.Config) *eh.Client {
	return eh.NewClient(cfg.EH.UserAgent, cfg.EH.RequestTimeout, nil)
}

func provideAuthService(queries *store.Queries, cfg config.Config) *auth.Service {
	return auth.NewService(queries, cfg.Security.AllowRegistration)
}
