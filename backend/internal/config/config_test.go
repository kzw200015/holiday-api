package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// 三层来源的优先级：默认值 → config.yml → 环境变量。
// 这是这个包里唯一的真逻辑，写错了表现是「配置改了但没生效」，很难当场看出来。
func TestLoadPrecedence(t *testing.T) {
	inTempDirWithConfig(t, `
security:
  secretKey: from-yml
  tokenTtl: 1s
database:
  url: postgres://from-yml
`)

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	// yml 里写了的项生效
	if cfg.Security.SecretKey != "from-yml" || cfg.Database.URL != "postgres://from-yml" {
		t.Errorf("yml 没生效: %+v", cfg.Security)
	}
	// 带单位的字符串解析成 Duration
	if cfg.Security.TokenTTL != time.Second {
		t.Errorf("tokenTtl = %v, 期望 1s", cfg.Security.TokenTTL)
	}
	// yml 没写的项落回默认值（默认值在代码里就是 Go 的 Duration 常量）
	if cfg.Port != 8000 || cfg.Security.AttachmentTTL != 24*time.Hour {
		t.Errorf("默认值没兜住: port=%d attachmentTtl=%v", cfg.Port, cfg.Security.AttachmentTTL)
	}

	// 环境变量盖过 yml，名字仍是扁平的老写法
	t.Setenv("EH_SECRET_KEY", "from-env")
	t.Setenv("TOKEN_TTL", "2s")
	cfg, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Security.SecretKey != "from-env" || cfg.Security.TokenTTL != 2*time.Second {
		t.Errorf("环境变量没盖过 yml: %+v", cfg.Security)
	}
}

// 密钥留空意味着任何人都能伪造任意用户的令牌，必须拦在启动之前。
func TestLoadRequiresSecretKey(t *testing.T) {
	inTempDirWithConfig(t, "database:\n  url: postgres://x\n")

	if _, err := Load(); err == nil {
		t.Error("缺 secretKey 时仍然加载成功了")
	}
}

// 换到一个只有指定 config.yml 的空目录，免得读到仓库里那份本地配置。
func inTempDirWithConfig(t *testing.T, yaml string) {
	t.Helper()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.yml"), []byte(yaml), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)
	// 开发机上可能真设了这个变量，会盖过 yml 把用例弄花
	t.Setenv("EH_SECRET_KEY", "")
}
