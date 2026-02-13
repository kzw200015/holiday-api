package codexproxy

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"myapi/internal/ent"
	"myapi/internal/ent/codexaccount"

	"github.com/gin-gonic/gin"
	resty "resty.dev/v3"
)

const (
	codexResponsesURL = "https://chatgpt.com/backend-api/codex/responses"
	defaultStickyTTL  = time.Hour
)

var (
	ErrNoAvailableAccount  = errors.New("no available codex account")
	ErrUpstreamRequestFail = errors.New("upstream request failed")
	ErrInvalidRequestBody  = errors.New("invalid request body")
)

type tokenUsage struct {
	InputTokens       int
	CachedInputTokens int
	OutputTokens      int
}

type CallLog struct {
	UserAgent         string
	ClientIP          string
	InputTokens       int
	CachedInputTokens int
	OutputTokens      int
	CacheRate         float64
	DurationMs        int
	AccountID         string
	AccountName       string
	IsSSE             bool
}

type ProxyService struct {
	client               *ent.Client
	httpClient           *resty.Client
	rrCounter            atomic.Uint64
	stickySessionService *StickySessionService
}

// NewProxyService 创建 Codex responses 反向代理服务。
func NewProxyService(client *ent.Client) *ProxyService {
	httpClient := resty.New()
	httpClient.SetTimeout(0)

	return &ProxyService{
		client:               client,
		httpClient:           httpClient,
		stickySessionService: NewStickySessionService(defaultStickyTTL),
	}
}

// ProxyResponses 将请求转发到上游并回传响应内容。
func (s *ProxyService) ProxyResponses(c *gin.Context, body []byte) (CallLog, error) {
	startAt := time.Now()
	clientIP := c.ClientIP()
	userAgent := strings.TrimSpace(c.GetHeader("User-Agent"))

	var payload struct {
		Stream         bool   `json:"stream"`
		PromptCacheKey string `json:"prompt_cache_key"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return CallLog{
			UserAgent: userAgent,
			ClientIP:  clientIP,
		}, ErrInvalidRequestBody
	}

	stickyKey := s.stickySessionService.ExtractKey(c.Request.Header, payload.PromptCacheKey)

	account, err := s.selectAccount(c.Request.Context(), stickyKey)
	if err != nil {
		return CallLog{
			UserAgent: userAgent,
			ClientIP:  clientIP,
			IsSSE:     payload.Stream,
		}, err
	}

	usage := tokenUsage{}
	upstreamHeaders := buildUpstreamHeaders(c.Request.Header, account)
	if payload.Stream {
		sseUsage, err := s.forwardSSE(c, body, upstreamHeaders)
		if err != nil {
			return CallLog{
				UserAgent:   userAgent,
				ClientIP:    clientIP,
				AccountID:   account.AccountID,
				AccountName: account.Name,
				IsSSE:       payload.Stream,
			}, err
		}
		usage = sseUsage
	} else {
		httpUsage, err := s.forwardHTTP(c, body, upstreamHeaders)
		if err != nil {
			return CallLog{
				UserAgent:   userAgent,
				ClientIP:    clientIP,
				AccountID:   account.AccountID,
				AccountName: account.Name,
				IsSSE:       payload.Stream,
			}, err
		}
		usage = httpUsage
	}

	cacheRate := 0.0
	if usage.InputTokens > 0 {
		cacheRate = float64(usage.CachedInputTokens) / float64(usage.InputTokens)
	}

	return CallLog{
		UserAgent:         userAgent,
		ClientIP:          clientIP,
		InputTokens:       usage.InputTokens,
		CachedInputTokens: usage.CachedInputTokens,
		OutputTokens:      usage.OutputTokens,
		CacheRate:         cacheRate,
		DurationMs:        int(time.Since(startAt).Milliseconds()),
		AccountID:         account.AccountID,
		AccountName:       account.Name,
		IsSSE:             payload.Stream,
	}, nil
}

// buildUpstreamHeaders 构建转发到上游 Codex 的请求头。
func buildUpstreamHeaders(incomingHeaders http.Header, account *ent.CodexAccount) http.Header {
	headers := incomingHeaders.Clone()
	if headers == nil {
		headers = make(http.Header)
	}
	headers.Set("authorization", "Bearer "+account.Token)
	headers.Set("chatgpt-account-id", account.AccountID)
	return headers
}

// copyResponseHeaders 将上游响应头复制到下游并过滤冲突字段。
func copyResponseHeaders(dst http.Header, src http.Header) {
	for key, values := range src {
		lowerKey := strings.ToLower(key)
		if lowerKey == "transfer-encoding" {
			continue
		}
		dst.Del(key)
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

// selectAccount 依据粘滞策略与轮询选择可用账户。
func (s *ProxyService) selectAccount(ctx context.Context, stickyKey string) (*ent.CodexAccount, error) {
	accounts, err := s.client.CodexAccount.Query().
		Where(codexaccount.ExpiresAtGT(time.Now())).
		Order(ent.Asc(codexaccount.FieldCreatedAt)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(accounts) == 0 {
		return nil, ErrNoAvailableAccount
	}

	if stickyKey != "" {
		stickyAccountID, found := s.stickySessionService.GetBindingAccountID(stickyKey)
		if found {
			for _, account := range accounts {
				if account.AccountID == stickyAccountID {
					return account, nil
				}
			}
			s.stickySessionService.DeleteBinding(stickyKey)
		}
	}

	index := int(s.rrCounter.Add(1)-1) % len(accounts)
	selected := accounts[index]
	if stickyKey != "" {
		s.stickySessionService.SetBinding(stickyKey, selected.AccountID)
	}
	return selected, nil
}
