package codexproxy

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"myapi/internal/ent"
	"myapi/internal/ent/codexaccount"
	"myapi/internal/ent/codexresponselog"
	"myapi/internal/pagination"

	"github.com/gin-gonic/gin"
	"github.com/go-resty/resty/v2"
)

const (
	codexResponsesURL = "https://chatgpt.com/backend-api/codex/responses"
	defaultStickyTTL  = time.Hour
)

var (
	ErrNoAvailableAccount  = errors.New("no available codex account")
	ErrUpstreamRequestFail = errors.New("upstream request failed")
)

var passthroughRequestHeaders = map[string]bool{
	"accept":          true,
	"content-type":    true,
	"user-agent":      true,
	"originator":      true,
	"conversation_id": true,
	"session_id":      true,
}

type RequestPayload struct {
	Stream         bool   `json:"stream"`
	PromptCacheKey string `json:"prompt_cache_key"`
}

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

type ResponseLogItem struct {
	UserAgent         string    `json:"userAgent"`
	ClientIP          string    `json:"clientIp"`
	InputTokens       int       `json:"inputTokens"`
	CachedInputTokens int       `json:"cachedInputTokens"`
	OutputTokens      int       `json:"outputTokens"`
	CacheRate         float64   `json:"cacheRate"`
	DurationMs        int       `json:"durationMs"`
	AccountID         string    `json:"accountId"`
	AccountName       string    `json:"accountName"`
	IsSSE             bool      `json:"isSse"`
	CreatedAt         time.Time `json:"createdAt"`
}

type stickyBinding struct {
	AccountID string
	ExpiresAt time.Time
}

type Service struct {
	client         *ent.Client
	httpClient     *resty.Client
	stickyTTL      time.Duration
	rrCounter      atomic.Uint64
	stickyMu       sync.Mutex
	stickyBindings map[string]stickyBinding
}

func NewService(client *ent.Client) *Service {
	httpClient := resty.New()
	httpClient.SetTimeout(0)

	return &Service{
		client:         client,
		httpClient:     httpClient,
		stickyTTL:      defaultStickyTTL,
		stickyBindings: make(map[string]stickyBinding),
	}
}

func ParseRequestPayload(body []byte) (RequestPayload, error) {
	var payload RequestPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return RequestPayload{}, err
	}
	return payload, nil
}

func (s *Service) ProxyResponses(c *gin.Context, body []byte, payload RequestPayload) (CallLog, error) {
	startAt := time.Now()
	clientIP := c.ClientIP()
	userAgent := strings.TrimSpace(c.GetHeader("User-Agent"))
	stickyKey := extractStickyKey(c.Request.Header, payload.PromptCacheKey)

	account, err := s.selectAccount(c.Request.Context(), stickyKey)
	if err != nil {
		return CallLog{
			UserAgent: userAgent,
			ClientIP:  clientIP,
			IsSSE:     payload.Stream,
		}, err
	}

	upstreamResp, err := s.sendUpstreamRequest(c, body, payload, account)
	if err != nil {
		return CallLog{
			UserAgent:   userAgent,
			ClientIP:    clientIP,
			AccountID:   account.AccountID,
			AccountName: account.Name,
			IsSSE:       payload.Stream,
		}, err
	}
	defer func() {
		_ = upstreamResp.RawResponse.Body.Close()
	}()

	usage := tokenUsage{}
	isSSE := payload.Stream && isEventStreamContentType(upstreamResp.RawResponse.Header.Get("Content-Type"))
	if isSSE {
		s.forwardSSE(c, upstreamResp.RawResponse, &usage)
	} else {
		s.forwardHTTP(c, upstreamResp.RawResponse, &usage)
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
		IsSSE:             isSSE,
	}, nil
}

func (s *Service) WriteCallLog(ctx context.Context, callLog CallLog) error {
	_, err := s.client.CodexResponseLog.Create().
		SetUserAgent(callLog.UserAgent).
		SetClientIP(callLog.ClientIP).
		SetInputTokens(callLog.InputTokens).
		SetCachedInputTokens(callLog.CachedInputTokens).
		SetOutputTokens(callLog.OutputTokens).
		SetCacheRate(callLog.CacheRate).
		SetDurationMs(callLog.DurationMs).
		SetAccountID(callLog.AccountID).
		SetAccountName(callLog.AccountName).
		SetIsSse(callLog.IsSSE).
		Save(ctx)
	return err
}

func (s *Service) ListResponseLogsPage(ctx context.Context, page int, pageSize int) (pagination.PaginatedResult[ResponseLogItem], error) {
	total, err := s.client.CodexResponseLog.Query().Count(ctx)
	if err != nil {
		return pagination.PaginatedResult[ResponseLogItem]{}, err
	}

	logs, err := s.client.CodexResponseLog.Query().
		Order(ent.Desc(codexresponselog.FieldCreatedAt), ent.Desc(codexresponselog.FieldID)).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		All(ctx)
	if err != nil {
		return pagination.PaginatedResult[ResponseLogItem]{}, err
	}

	items := make([]ResponseLogItem, 0, len(logs))
	for _, item := range logs {
		items = append(items, ResponseLogItem{
			UserAgent:         item.UserAgent,
			ClientIP:          item.ClientIP,
			InputTokens:       item.InputTokens,
			CachedInputTokens: item.CachedInputTokens,
			OutputTokens:      item.OutputTokens,
			CacheRate:         item.CacheRate,
			DurationMs:        item.DurationMs,
			AccountID:         item.AccountID,
			AccountName:       item.AccountName,
			IsSSE:             item.IsSse,
			CreatedAt:         item.CreatedAt,
		})
	}

	return pagination.PaginatedResult[ResponseLogItem]{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func (s *Service) sendUpstreamRequest(c *gin.Context, body []byte, payload RequestPayload, account *ent.CodexAccount) (*resty.Response, error) {
	req := s.httpClient.R().
		SetContext(c.Request.Context()).
		SetBody(body).
		SetDoNotParseResponse(true)

	req.SetHeader("authorization", "Bearer "+account.Token)
	req.SetHeader("chatgpt-account-id", account.AccountID)
	req.SetHeader("OpenAI-Beta", "responses=experimental")
	req.SetHeader("accept", "text/event-stream")
	req.SetHeader("originator", "opencode")

	for key, values := range c.Request.Header {
		lowerKey := strings.ToLower(key)
		if !passthroughRequestHeaders[lowerKey] {
			continue
		}
		for _, value := range values {
			req.SetHeader(key, value)
		}
	}
	if req.Header.Get("content-type") == "" {
		req.SetHeader("content-type", "application/json")
	}
	if payload.PromptCacheKey != "" {
		if req.Header.Get("conversation_id") == "" {
			req.SetHeader("conversation_id", payload.PromptCacheKey)
		}
		if req.Header.Get("session_id") == "" {
			req.SetHeader("session_id", payload.PromptCacheKey)
		}
	}

	resp, err := req.Post(codexResponsesURL)
	if err != nil {
		return nil, ErrUpstreamRequestFail
	}
	return resp, nil
}

func (s *Service) selectAccount(ctx context.Context, stickyKey string) (*ent.CodexAccount, error) {
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
		stickyAccountID, found := s.getStickyAccountID(stickyKey)
		if found {
			for _, account := range accounts {
				if account.AccountID == stickyAccountID {
					return account, nil
				}
			}
			s.deleteSticky(stickyKey)
		}
	}

	index := int(s.rrCounter.Add(1)-1) % len(accounts)
	selected := accounts[index]
	if stickyKey != "" {
		s.setSticky(stickyKey, selected.AccountID)
	}
	return selected, nil
}

func (s *Service) setSticky(stickyKey string, accountID string) {
	s.stickyMu.Lock()
	defer s.stickyMu.Unlock()
	s.stickyBindings[stickyKey] = stickyBinding{
		AccountID: accountID,
		ExpiresAt: time.Now().Add(s.stickyTTL),
	}
}

func (s *Service) getStickyAccountID(stickyKey string) (string, bool) {
	s.stickyMu.Lock()
	defer s.stickyMu.Unlock()

	binding, found := s.stickyBindings[stickyKey]
	if !found {
		return "", false
	}
	if time.Now().After(binding.ExpiresAt) {
		delete(s.stickyBindings, stickyKey)
		return "", false
	}
	return binding.AccountID, true
}

func (s *Service) deleteSticky(stickyKey string) {
	s.stickyMu.Lock()
	defer s.stickyMu.Unlock()
	delete(s.stickyBindings, stickyKey)
}

func (s *Service) forwardHTTP(c *gin.Context, upstreamResp *http.Response, usage *tokenUsage) {
	copyResponseHeaders(c.Writer.Header(), upstreamResp.Header)

	body, err := io.ReadAll(upstreamResp.Body)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	parsedUsage := parseUsageFromResponseBody(body)
	usage.InputTokens = parsedUsage.InputTokens
	usage.CachedInputTokens = parsedUsage.CachedInputTokens
	usage.OutputTokens = parsedUsage.OutputTokens

	contentType := upstreamResp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Data(upstreamResp.StatusCode, contentType, body)
}

func (s *Service) forwardSSE(c *gin.Context, upstreamResp *http.Response, usage *tokenUsage) {
	copyResponseHeaders(c.Writer.Header(), upstreamResp.Header)
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Status(upstreamResp.StatusCode)

	reader := bufio.NewReader(upstreamResp.Body)
	c.Stream(func(writer io.Writer) bool {
		line, err := reader.ReadString('\n')
		if line != "" {
			_, _ = io.WriteString(writer, line)
			updateUsageFromSSEDataLine(line, usage)
		}
		if err != nil {
			return false
		}
		return true
	})
}

func copyResponseHeaders(dst http.Header, src http.Header) {
	for key, values := range src {
		lowerKey := strings.ToLower(key)
		if lowerKey == "content-length" || lowerKey == "transfer-encoding" {
			continue
		}
		dst.Del(key)
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func isEventStreamContentType(contentType string) bool {
	return strings.Contains(strings.ToLower(contentType), "text/event-stream")
}

func parseUsageFromResponseBody(body []byte) tokenUsage {
	var response struct {
		Usage struct {
			InputTokens       int `json:"input_tokens"`
			OutputTokens      int `json:"output_tokens"`
			InputTokenDetails struct {
				CachedTokens int `json:"cached_tokens"`
			} `json:"input_tokens_details"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return tokenUsage{}
	}
	return tokenUsage{
		InputTokens:       response.Usage.InputTokens,
		CachedInputTokens: response.Usage.InputTokenDetails.CachedTokens,
		OutputTokens:      response.Usage.OutputTokens,
	}
}

func updateUsageFromSSEDataLine(line string, usage *tokenUsage) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "data:") {
		return
	}

	rawJSON := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
	if rawJSON == "" || rawJSON == "[DONE]" {
		return
	}

	var event struct {
		Usage struct {
			InputTokens       int `json:"input_tokens"`
			OutputTokens      int `json:"output_tokens"`
			InputTokenDetails struct {
				CachedTokens int `json:"cached_tokens"`
			} `json:"input_tokens_details"`
		} `json:"usage"`
		Response struct {
			Usage struct {
				InputTokens       int `json:"input_tokens"`
				OutputTokens      int `json:"output_tokens"`
				InputTokenDetails struct {
					CachedTokens int `json:"cached_tokens"`
				} `json:"input_tokens_details"`
			} `json:"usage"`
		} `json:"response"`
	}
	if err := json.Unmarshal([]byte(rawJSON), &event); err != nil {
		return
	}

	if event.Response.Usage.InputTokens > 0 || event.Response.Usage.OutputTokens > 0 {
		usage.InputTokens = event.Response.Usage.InputTokens
		usage.CachedInputTokens = event.Response.Usage.InputTokenDetails.CachedTokens
		usage.OutputTokens = event.Response.Usage.OutputTokens
		return
	}
	if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
		usage.InputTokens = event.Usage.InputTokens
		usage.CachedInputTokens = event.Usage.InputTokenDetails.CachedTokens
		usage.OutputTokens = event.Usage.OutputTokens
	}
}

func extractStickyKey(headers http.Header, promptCacheKey string) string {
	sessionID := strings.TrimSpace(headers.Get("session_id"))
	if sessionID != "" {
		return hashStickyValue(sessionID)
	}

	conversationID := strings.TrimSpace(headers.Get("conversation_id"))
	if conversationID != "" {
		return hashStickyValue(conversationID)
	}

	if strings.TrimSpace(promptCacheKey) != "" {
		return hashStickyValue(promptCacheKey)
	}
	return ""
}

func hashStickyValue(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
