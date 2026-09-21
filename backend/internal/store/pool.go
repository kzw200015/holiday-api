package store

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"myapi/internal/config"
)

// NewPool 建连接池。
//
// 第二个返回值是 wire 的 cleanup：它会被串进 injector 交出来的那一个 cleanup 里，
// 后面哪个 provider 失败了也会被调到，所以连接池不会漏。
func NewPool(ctx context.Context, cfg config.Database, logger *slog.Logger) (*pgxpool.Pool, func(), error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.URL)
	if err != nil {
		return nil, nil, fmt.Errorf("数据库连接串解析失败: %w", err)
	}
	poolConfig.MaxConns = cfg.MaxConns
	poolConfig.MaxConnLifetime = cfg.MaxConnLifetime

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, nil, err
	}

	// 池是惰性建连的，这里还没真连上库；连不通会在启动时那次节假日刷新暴露出来
	logger.Info("数据库连接池已就绪", "maxConns", poolConfig.MaxConns)

	return pool, pool.Close, nil
}
