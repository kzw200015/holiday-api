// Package config 基于 viper 加载应用配置。
package config

import (
	"errors"
	"fmt"
	"io/fs"

	"github.com/spf13/viper"
)

// Port 是服务监听端口。
const Port = 8000

// Config 保存应用运行所需的全部配置项。
type Config struct {
	// DBURL 是 PostgreSQL 连接串，来自配置项 DB_URL。
	DBURL string
}

// Load 读取配置：优先取环境变量，其次取工作目录下的 .env 文件；缺少必填项时返回错误。
func Load() (*Config, error) {
	v := viper.New()

	// 开发环境从 .env 读取，文件不存在时只依赖环境变量
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	if err := v.ReadInConfig(); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("读取 .env 失败: %w", err)
	}

	// 环境变量优先级高于 .env 文件
	v.AutomaticEnv()

	dbURL := v.GetString("DB_URL")
	if dbURL == "" {
		return nil, errors.New("配置项 DB_URL 未设置")
	}
	return &Config{DBURL: dbURL}, nil
}
