// Package database 是 PostgreSQL 的连接池。
package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kzw200015/myapi/internal/config"
	"github.com/kzw200015/myapi/migrations"
)

// NewPool 建出连接池并执行迁移，拿到它的部件都能确信表结构是最新的；返回的 cleanup 关掉它。
func NewPool(ctx context.Context, cfg config.Config) (*pgxpool.Pool, func(), error) {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("DATABASE_URL 写错了: %w", err)
	}
	if err := migrations.Up(ctx, pool); err != nil {
		pool.Close()
		return nil, nil, err
	}
	return pool, pool.Close, nil
}
