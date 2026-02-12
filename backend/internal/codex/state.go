package codex

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// GenerateRandomState 生成 OAuth state（用于防止 CSRF）。
func GenerateRandomState() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("生成随机 state 失败: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}
