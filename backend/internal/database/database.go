// Package database 负责建立并配置 PostgreSQL 连接池。
package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"

	// 注册 pgx 的 database/sql 驱动
	_ "github.com/jackc/pgx/v5/stdlib"
)

// Connect 建立数据库连接池并验证连通性。
func Connect(ctx context.Context, dbURL string) (*sqlx.DB, error) {
	db, err := sqlx.Open("pgx", dbURL)
	if err != nil {
		return nil, fmt.Errorf("打开数据库连接失败: %w", err)
	}

	// 连接池参数：避免连接数无节制增长，并回收长期空闲连接
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)
	db.SetConnMaxIdleTime(10 * time.Minute)

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("数据库连接测试失败: %w", err)
	}
	return db, nil
}
