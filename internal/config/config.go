// Package config 读配置：全来自环境变量，启动时校验，缺了或写错进程拒绝启动。清单见 .env.example。
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/go-viper/mapstructure/v2"
	"github.com/spf13/viper"
)

// Config 是全部配置。字段对应的环境变量是 mapstructure 标签的大写。
type Config struct {
	// DatabaseURL 是 PostgreSQL 的连接串，postgres:// 的格式，必填
	DatabaseURL string `mapstructure:"database_url"`
	// Port 是监听的端口
	Port int `mapstructure:"port"`
	// OutboundTimeout 是出网请求从连接到读完响应体最多多久
	OutboundTimeout time.Duration `mapstructure:"outbound_timeout"`
	// OutboundUserAgent 是出网请求一律带的 User-Agent
	OutboundUserAgent string `mapstructure:"outbound_user_agent"`
	// HolidaySourceURL 是节假日数据源放各年文件的地址，`{year}.json` 拼在后面
	HolidaySourceURL string `mapstructure:"holiday_source_url"`
	// LogLevel 是日志级别：debug、info、warn、error
	LogLevel slog.Level `mapstructure:"log_level"`
}

// defaults 是各项的默认值；没有默认值的必填项也列在这里（空值），viper 只认得登记过的键。
var defaults = map[string]any{
	"database_url": "",
	"port":         8000,
	// 默认伪装成一个桌面 Chrome：默认的 UA 容易被当成爬虫拦下
	"outbound_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
	"outbound_timeout":    30 * time.Second,
	// GitHub 连不上时可以换成镜像，测试换成本机的假数据源
	"holiday_source_url": "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master",
	"log_level":          "info",
}

// Load 从环境变量读出配置并校验。空的环境变量当作没设。
func Load() (Config, error) {
	v := viper.New()
	for key, value := range defaults {
		v.SetDefault(key, value)
	}
	v.AutomaticEnv()

	var config Config
	// 时长写成 Go 的格式（30s、500ms），日志级别按 slog 的名字解
	hooks := mapstructure.ComposeDecodeHookFunc(mapstructure.StringToTimeDurationHookFunc(), mapstructure.TextUnmarshallerHookFunc())
	if err := v.Unmarshal(&config, viper.DecodeHook(hooks)); err != nil {
		return Config{}, fmt.Errorf("配置写错了: %w", err)
	}
	if err := config.validate(); err != nil {
		return Config{}, fmt.Errorf("配置写错了: %w", err)
	}
	return config, nil
}

func (c Config) validate() error {
	var problems []error
	if c.DatabaseURL == "" {
		problems = append(problems, errors.New("缺少 DATABASE_URL"))
	}
	if c.Port < 1 || c.Port > 65535 {
		problems = append(problems, fmt.Errorf("PORT 应在 1 到 65535 之间，现在是 %d", c.Port))
	}
	if c.OutboundTimeout <= 0 {
		problems = append(problems, fmt.Errorf("OUTBOUND_TIMEOUT 应大于 0，现在是 %s", c.OutboundTimeout))
	}
	if strings.TrimSpace(c.OutboundUserAgent) == "" {
		problems = append(problems, errors.New("OUTBOUND_USER_AGENT 不能是空白"))
	}
	if strings.TrimSpace(c.HolidaySourceURL) == "" {
		problems = append(problems, errors.New("HOLIDAY_SOURCE_URL 不能是空白"))
	}
	return errors.Join(problems...)
}
