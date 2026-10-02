// Package migrations 是数据库迁移：goose 的 SQL 文件编进二进制，启动时执行。
//
// 改表结构就加一个 `<N>_描述.sql`，已经执行过的迁移不改。
package migrations

import (
	"context"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed *.sql
var files embed.FS

// Up 执行还没执行过的迁移。
//
// 多个实例同时启动时经 PostgreSQL 的 advisory lock 排队，同一时刻只有一个在迁移。
func Up(ctx context.Context, pool *pgxpool.Pool) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()

	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return fmt.Errorf("建迁移锁失败: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithSessionLocker(locker))
	if err != nil {
		return fmt.Errorf("加载迁移失败: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("执行迁移失败: %w", err)
	}
	return nil
}
