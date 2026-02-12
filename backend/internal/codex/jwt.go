package codex

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

type jwtClaims struct {
	Email string `json:"email"`
	Auth  struct {
		ChatgptAccountID string `json:"chatgpt_account_id"`
	} `json:"https://api.openai.com/auth"`
}

// ExtractAccountIDFromIDToken 解析 id_token 并提取 Codex account id。
func ExtractAccountIDFromIDToken(idToken string) (accountID string, email string, err error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return "", "", fmt.Errorf("id_token 格式错误")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", "", fmt.Errorf("解析 id_token 失败: %w", err)
	}

	var claims jwtClaims
	if err = json.Unmarshal(payload, &claims); err != nil {
		return "", "", fmt.Errorf("解析 id_token 失败: %w", err)
	}

	return claims.Auth.ChatgptAccountID, claims.Email, nil
}
