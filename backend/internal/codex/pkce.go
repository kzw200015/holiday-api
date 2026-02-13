package codex

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// PKCECodes 是 OAuth PKCE 所需的 verifier/challenge。
type PKCECodes struct {
	CodeVerifier  string
	CodeChallenge string
}

// generateCodeVerifier 生成符合 OAuth PKCE 要求的随机 verifier。
func generateCodeVerifier() (string, error) {
	bytes := make([]byte, 64)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("生成随机字节失败: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

// generateCodeChallenge 基于 verifier 计算 S256 challenge。
func generateCodeChallenge(verifier string) string {
	hash := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(hash[:])
}

// GeneratePKCECodes 生成一组 PKCE verifier/challenge（S256）。
func GeneratePKCECodes() (*PKCECodes, error) {
	verifier, err := generateCodeVerifier()
	if err != nil {
		return nil, err
	}

	return &PKCECodes{
		CodeVerifier:  verifier,
		CodeChallenge: generateCodeChallenge(verifier),
	}, nil
}
