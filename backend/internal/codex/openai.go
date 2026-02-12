package codex

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const (
	openaiAuthorizeURL = "https://auth.openai.com/oauth/authorize"
	openaiTokenURL     = "https://auth.openai.com/oauth/token"
	openaiClientID     = "app_EMoamEEZ73f0CkXaXp7hrann"
	redirectURI        = "http://localhost:1455/auth/callback"
)

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// BuildAuthorizeURL 构造 Codex OAuth 授权链接。
func BuildAuthorizeURL(state string, pkce *PKCECodes) (string, error) {
	if pkce == nil {
		return "", fmt.Errorf("PKCE 参数缺失")
	}

	params := url.Values{
		"client_id":                  {openaiClientID},
		"response_type":              {"code"},
		"redirect_uri":               {redirectURI},
		"scope":                      {"openid email profile offline_access"},
		"state":                      {state},
		"code_challenge":             {pkce.CodeChallenge},
		"code_challenge_method":      {"S256"},
		"prompt":                     {"login"},
		"id_token_add_organizations": {"true"},
		"codex_cli_simplified_flow":  {"true"},
	}
	return openaiAuthorizeURL + "?" + params.Encode(), nil
}

// ExchangeCodeForTokens 使用授权码换取 token。
func ExchangeCodeForTokens(ctx context.Context, httpClient *http.Client, code string, pkce *PKCECodes) (raw json.RawMessage, parsed tokenResponse, err error) {
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	if pkce == nil {
		return nil, tokenResponse{}, fmt.Errorf("PKCE 参数缺失")
	}

	form := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {openaiClientID},
		"code":          {strings.TrimSpace(code)},
		"redirect_uri":  {redirectURI},
		"code_verifier": {pkce.CodeVerifier},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openaiTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, tokenResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "codex-cli/0.91.0")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, tokenResponse{}, err
	}
	defer func() { _ = resp.Body.Close() }()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, tokenResponse{}, err
	}

	raw = json.RawMessage(bodyBytes)
	if resp.StatusCode != http.StatusOK {
		return raw, tokenResponse{}, fmt.Errorf("token 交换失败: status=%d", resp.StatusCode)
	}

	if err = json.Unmarshal(bodyBytes, &parsed); err != nil {
		return raw, tokenResponse{}, fmt.Errorf("解析 token 响应失败: %w", err)
	}

	return raw, parsed, nil
}
