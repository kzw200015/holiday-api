// Package config 收拢全部运行配置。
//
// 三层来源，后面的盖前面的：结构体默认值 → 可选的 config.yml → 环境变量。
// 环境变量名一律是扁平的大写（SECRET_KEY、TOKEN_TTL……），不按 key 分段；
// yml 里则按 key 分段写，本地开发不必往 shell 里塞一堆 export。
//
// 时长写成带单位的字符串（"720h"、"30s"），由 viper 默认的 StringToTimeDurationHookFunc
// 解析成 time.Duration；代码里的默认值直接写 Go 的常量（30 * 24 * time.Hour），比字符串好读。
// 别在 yml 里写裸数字——那会绕过钩子被当成纳秒，差一百万倍还不报错。
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	// HTTP 监听端口，前端 dev 代理与 Dockerfile 的 EXPOSE 都指向 8000。
	Port int `mapstructure:"port"`
	// 前端构建产物目录，镜像构建时由 frontend-builder 阶段填充。
	StaticDir string   `mapstructure:"staticDir"`
	Database  Database `mapstructure:"database"`
	Log       Log      `mapstructure:"log"`
	Holiday   Holiday  `mapstructure:"holiday"`
	Security  Security `mapstructure:"security"`
	EH        EH       `mapstructure:"eh"`
}

type Database struct {
	// PostgreSQL 连接串。pgx 默认按 sslmode=prefer 协商，要强制 TLS 就在串上加 ?sslmode=require。
	URL string `mapstructure:"url"`
	// 连接池上限与单条连接的最长存活时间，其余项用 pgxpool 默认值。
	MaxConns        int32         `mapstructure:"maxConns"`
	MaxConnLifetime time.Duration `mapstructure:"maxConnLifetime"`
}

type Log struct {
	// 最低输出级别：debug / info / warn / error。
	Level string `mapstructure:"level"`
	// 输出格式：json 或 text。默认看标准输出是不是终端——本地开发是终端就用 text，
	// 容器里 stdout 接的是日志采集就用 json，不用在两边分别配。
	Format string `mapstructure:"format"`
}

type Holiday struct {
	// 定时刷新节假日数据的间隔，默认 24 小时。数据源一年只更新几次（次年安排公布、临时调休），
	// 每天拉一次足够，也不会给数据源造成压力。
	RefreshInterval time.Duration `mapstructure:"refreshInterval"`
}

type Security struct {
	// 主密钥，JWT 签名和图片地址签名由它派生出各自的子密钥（见 internal/signing）。
	//
	// 这一项故意没有可用的默认值：数据库口令泄露只影响这一个库，而签名密钥泄露意味着任何人
	// 都能伪造任意用户的令牌。为空时 Load 直接报错，进程拒绝启动。用 `openssl rand -hex 32` 生成。
	SecretKey string `mapstructure:"secretKey"`
	// 是否开放注册，**默认关闭**。
	//
	// 公网部署时任何人注册即可借这台机器代理 e 站流量，被封的是本机出口 IP。
	// 而且 eh_credentials.cookie 存的是明文凭据，账号越少、越都是自己人，这个取舍才成立。
	//
	// 建第一个账号的办法：把它打开、启动、注册完再关回去重启。
	AllowRegistration bool `mapstructure:"allowRegistration"`
	// 登录令牌有效期，默认 30 天。令牌无状态，服务端不存已签发的令牌，所以没法提前作废。
	TokenTTL time.Duration `mapstructure:"tokenTtl"`
	// 签名图片地址的有效期，默认 24 小时。
	//
	// 这类地址是 <img src> 用的，带不了 Authorization 头，只能靠签名认身份，
	// 一旦被转发出去，在有效期内谁都能打开，所以别设太长。过期表现为图片裂开，
	// 刷新页面重新取一次详情就会拿到新签的地址。
	AttachmentTTL time.Duration `mapstructure:"attachmentTtl"`
}

type EH struct {
	// 请求 e 站时伪装的 User-Agent。Go 默认发 `Go-http-client/2.0`，
	// 在一个明确禁止自动化抓取的站点上等于举手，必须换成真实浏览器的 UA。
	UserAgent string `mapstructure:"userAgent"`
	// 单次请求的总超时。e 站页面偶尔很慢，但超过 30 秒基本就是不通了。
	RequestTimeout time.Duration `mapstructure:"requestTimeout"`
}

const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

// 配置项清单：viper 的 key、对应的环境变量名、默认值。
//
// 三件事写在一行，加一项就是加一行，不会出现「加了默认值忘了绑环境变量」这种漏。
// 之所以逐条 BindEnv 而不是 AutomaticEnv：后者对 Unmarshal **不生效**，
// 而且它会按 key 反推变量名（security.secretKey → SECURITY_SECRETKEY），跟现有的名字对不上。
type setting struct {
	key      string
	env      string
	fallback any
}

func settings() []setting {
	return []setting{
		{"port", "PORT", 8000},
		{"staticDir", "STATIC_DIR", defaultStaticDir()},

		{"database.url", "DATABASE_URL", "postgres://postgres:postgres@localhost:5432/myapi"},
		{"database.maxConns", "DATABASE_MAX_CONNS", 20},
		{"database.maxConnLifetime", "DATABASE_MAX_CONN_LIFETIME", time.Hour},

		{"log.level", "LOG_LEVEL", "info"},
		{"log.format", "LOG_FORMAT", defaultLogFormat()},

		{"holiday.refreshInterval", "HOLIDAY_REFRESH_INTERVAL", 24 * time.Hour},

		{"security.secretKey", "SECRET_KEY", ""},
		{"security.allowRegistration", "ALLOW_REGISTRATION", false},
		{"security.tokenTtl", "TOKEN_TTL", 30 * 24 * time.Hour},
		{"security.attachmentTtl", "ATTACHMENT_TTL", 24 * time.Hour},

		{"eh.userAgent", "EH_USER_AGENT", defaultUserAgent},
		{"eh.requestTimeout", "EH_REQUEST_TIMEOUT", 30 * time.Second},
	}
}

// Load 拼出配置。缺 SECRET_KEY 时返回错误——留空意味着任何人都能伪造任意用户的令牌，
// 这种问题一旦上线就查不出来，不如在这里直接把容器拦停。
func Load() (Config, error) {
	v := viper.New()
	for _, setting := range settings() {
		v.SetDefault(setting.key, setting.fallback)
		if err := v.BindEnv(setting.key, setting.env); err != nil {
			return Config{}, err
		}
	}

	// config.yml 是可选的：本地开发放一份省得往 shell 里塞 export，容器里通常全用环境变量。
	// 先找工作目录，再找可执行文件旁边（镜像里可以把它挂到 /app/config.yml）
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	if dir, err := executableDir(); err == nil {
		v.AddConfigPath(dir)
	}
	var notFound viper.ConfigFileNotFoundError
	if err := v.ReadInConfig(); err != nil && !errors.As(err, &notFound) {
		return Config{}, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, fmt.Errorf("解析配置失败: %w", err)
	}
	if err := cfg.validate(); err != nil {
		return Config{}, fmt.Errorf("配置不合法: %w", err)
	}
	return cfg, nil
}

// validate 把写错的配置拦在启动之前。
//
// 这些错误在运行期都不会自己冒出来：日志级别拼错只是悄悄退回 info，
// 有效期写成 0 的表现是「登录立刻掉线」或「图片一张都打不开」，到那时再回头查配置就晚了。
func (c Config) validate() error {
	if c.Security.SecretKey == "" {
		return errors.New("缺少 SECRET_KEY（或 config.yml 里的 security.secretKey），" +
			"用 `openssl rand -hex 32` 生成一个再启动")
	}
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("port 必须在 1 到 65535 之间，现在是 %d", c.Port)
	}
	var level slog.Level
	if err := level.UnmarshalText([]byte(c.Log.Level)); err != nil {
		return fmt.Errorf("log.level 只能是 debug / info / warn / error，现在是 %q", c.Log.Level)
	}
	if c.Log.Format != "json" && c.Log.Format != "text" {
		return fmt.Errorf("log.format 只能是 json 或 text，现在是 %q", c.Log.Format)
	}
	if c.Database.MaxConns < 1 {
		return fmt.Errorf("database.maxConns 至少为 1，现在是 %d", c.Database.MaxConns)
	}

	durations := []struct {
		name  string
		value time.Duration
	}{
		{"database.maxConnLifetime", c.Database.MaxConnLifetime},
		{"holiday.refreshInterval", c.Holiday.RefreshInterval},
		{"security.tokenTtl", c.Security.TokenTTL},
		{"security.attachmentTtl", c.Security.AttachmentTTL},
		{"eh.requestTimeout", c.EH.RequestTimeout},
	}
	for _, each := range durations {
		// 在 yml 里写裸数字会被当成纳秒（见包注释），这里顺带把那种写法也拦住：720 纳秒过不了 1 秒这道线
		if each.value < time.Second {
			return fmt.Errorf("%s 至少为 1s，现在是 %v（时长要带单位，如 \"720h\"）", each.name, each.value)
		}
	}
	return nil
}

// 静态资源默认落在可执行文件旁边的 public/：镜像里二进制在 /app/myapi、前端产物在 /app/public。
func defaultStaticDir() string {
	dir, err := executableDir()
	if err != nil {
		return "public"
	}
	return filepath.Join(dir, "public")
}

func executableDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(exe), nil
}

func defaultLogFormat() string {
	info, err := os.Stdout.Stat()
	if err == nil && info.Mode()&os.ModeCharDevice != 0 {
		return "text"
	}
	return "json"
}
