// Package config 负责从环境变量加载应用配置。
package config

import (
	"errors"
	"os"
)

// Port 是服务监听端口。
const Port = 8000

// Config 保存应用运行所需的全部配置项。
type Config struct {
	// DBURL 是 PostgreSQL 连接串，来自环境变量 DB_URL。
	DBURL string
}

// Load 从环境变量读取配置，缺少必填项时返回错误。
func Load() (*Config, error) {
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		return nil, errors.New("环境变量 DB_URL 未设置")
	}
	return &Config{DBURL: dbURL}, nil
}
