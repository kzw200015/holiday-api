package codex

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"myapi/internal/ent"
	"myapi/internal/ent/codexaccount"
	"myapi/internal/ent/codexoauthsession"
	"myapi/internal/pagination"
)

const (
	oauthSessionTTL = 10 * time.Minute
)

// OAuthSessionInfo 是前端发起 OAuth 所需信息。
type OAuthSessionInfo struct {
	State     string    `json:"state"`
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// Account 是 Codex OAuth 账户返回结构。
type Account struct {
	Name      string    `json:"name"`
	AccountID string    `json:"accountId"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// UpdateAccountRequest 是更新账户信息的请求结构，后续可按需扩展更多字段。
type UpdateAccountRequest struct {
	Name string `json:"name"`
}

// Service 负责 Codex OAuth 流程与账户存储。
type Service struct {
	client     *ent.Client
	httpClient *http.Client
}

func NewService(client *ent.Client) *Service {
	return &Service{client: client, httpClient: &http.Client{}}
}

func (s *Service) CreateOAuthSession(ctx context.Context) (OAuthSessionInfo, error) {
	state, err := GenerateRandomState()
	if err != nil {
		return OAuthSessionInfo{}, err
	}

	pkce, err := GeneratePKCECodes()
	if err != nil {
		return OAuthSessionInfo{}, err
	}

	url, err := BuildAuthorizeURL(state, pkce)
	if err != nil {
		return OAuthSessionInfo{}, err
	}

	expiresAt := time.Now().Add(oauthSessionTTL)
	if _, err = s.client.CodexOAuthSession.Create().
		SetState(state).
		SetCodeVerifier(pkce.CodeVerifier).
		SetCodeChallenge(pkce.CodeChallenge).
		SetExpiresAt(expiresAt).
		Save(ctx); err != nil {
		return OAuthSessionInfo{}, fmt.Errorf("创建 OAuth 会话失败: %w", err)
	}

	return OAuthSessionInfo{State: state, URL: url, ExpiresAt: expiresAt}, nil
}

func (s *Service) CompleteOAuth(ctx context.Context, name string, redirectURL string) (Account, error) {
	cb, err := ParseOAuthCallback(redirectURL)
	if err != nil {
		return Account{}, err
	}

	if cb.Error != "" {
		if cb.ErrorDescription != "" {
			return Account{}, fmt.Errorf("OAuth 失败: %s (%s)", cb.Error, cb.ErrorDescription)
		}
		return Account{}, fmt.Errorf("OAuth 失败: %s", cb.Error)
	}

	if cb.State == "" {
		return Account{}, fmt.Errorf("回调地址缺少 state")
	}
	if cb.Code == "" {
		return Account{}, fmt.Errorf("回调地址缺少 code")
	}

	session, err := s.client.CodexOAuthSession.Query().Where(codexoauthsession.StateEQ(cb.State)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return Account{}, fmt.Errorf("OAuth 会话不存在或已过期")
		}
		return Account{}, fmt.Errorf("查询 OAuth 会话失败: %w", err)
	}
	if time.Now().After(session.ExpiresAt) {
		_ = s.client.CodexOAuthSession.DeleteOneID(session.ID).Exec(ctx)
		return Account{}, fmt.Errorf("OAuth 会话已过期")
	}

	pkce := &PKCECodes{CodeVerifier: session.CodeVerifier, CodeChallenge: session.CodeChallenge}

	raw, tok, err := ExchangeCodeForTokens(ctx, s.httpClient, cb.Code, pkce)
	if err != nil {
		return Account{}, fmt.Errorf("token 交换失败: %w", err)
	}
	if tok.AccessToken == "" {
		return Account{}, fmt.Errorf("token 响应缺少 access_token")
	}
	if tok.IDToken == "" {
		return Account{}, fmt.Errorf("token 响应缺少 id_token")
	}

	accountID, _, err := ExtractAccountIDFromIDToken(tok.IDToken)
	if err != nil {
		return Account{}, err
	}
	if accountID == "" {
		return Account{}, fmt.Errorf("token 缺少 account id")
	}

	expiresAt := time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)

	payload := json.RawMessage(raw)
	created, err := s.client.CodexAccount.Create().
		SetName(name).
		SetAccountID(accountID).
		SetToken(tok.AccessToken).
		SetExpiresAt(expiresAt).
		SetOauthPayload(payload).
		Save(ctx)
	if err != nil {
		if !ent.IsConstraintError(err) {
			return Account{}, fmt.Errorf("写入账户失败: %w", err)
		}

		if _, errUpdate := s.client.CodexAccount.Update().
			Where(codexaccount.AccountIDEQ(accountID)).
			SetName(name).
			SetToken(tok.AccessToken).
			SetExpiresAt(expiresAt).
			SetOauthPayload(payload).
			Save(ctx); errUpdate != nil {
			return Account{}, fmt.Errorf("更新账户失败: %w", errUpdate)
		}

		created, err = s.client.CodexAccount.Query().Where(codexaccount.AccountIDEQ(accountID)).Only(ctx)
		if err != nil {
			return Account{}, fmt.Errorf("查询更新后的账户失败: %w", err)
		}
	}

	_ = s.client.CodexOAuthSession.DeleteOneID(session.ID).Exec(ctx)

	return Account{
		Name:      created.Name,
		AccountID: created.AccountID,
		Token:     created.Token,
		ExpiresAt: created.ExpiresAt,
		CreatedAt: created.CreatedAt,
		UpdatedAt: created.UpdatedAt,
	}, nil
}

func (s *Service) ListAccountsPage(ctx context.Context, page int, pageSize int) (pagination.PaginatedResult[Account], error) {
	total, err := s.client.CodexAccount.Query().Count(ctx)
	if err != nil {
		return pagination.PaginatedResult[Account]{}, fmt.Errorf("查询账户失败: %w", err)
	}

	accounts, err := s.client.CodexAccount.Query().
		Order(ent.Desc(codexaccount.FieldCreatedAt)).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		All(ctx)
	if err != nil {
		return pagination.PaginatedResult[Account]{}, fmt.Errorf("查询账户失败: %w", err)
	}

	out := make([]Account, 0, len(accounts))
	for _, a := range accounts {
		out = append(out, Account{
			Name:      a.Name,
			AccountID: a.AccountID,
			Token:     a.Token,
			ExpiresAt: a.ExpiresAt,
			CreatedAt: a.CreatedAt,
			UpdatedAt: a.UpdatedAt,
		})
	}
	return pagination.PaginatedResult[Account]{
		Items:    out,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

// UpdateAccount 更新账户信息。
func (s *Service) UpdateAccount(ctx context.Context, accountID string, req UpdateAccountRequest) (Account, error) {
	account, err := s.client.CodexAccount.Query().Where(codexaccount.AccountIDEQ(accountID)).Only(ctx)
	if err != nil {
		return Account{}, err
	}

	updated, err := s.client.CodexAccount.UpdateOneID(account.ID).
		SetName(req.Name).
		Save(ctx)
	if err != nil {
		return Account{}, fmt.Errorf("更新账户失败: %w", err)
	}

	return Account{
		Name:      updated.Name,
		AccountID: updated.AccountID,
		Token:     updated.Token,
		ExpiresAt: updated.ExpiresAt,
		CreatedAt: updated.CreatedAt,
		UpdatedAt: updated.UpdatedAt,
	}, nil
}
