package codexproxy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"myapi/internal/ent"
	"myapi/internal/ent/codexaccount"
	"myapi/internal/ent/codexresponselog"
	"myapi/internal/pagination"

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

type Service struct {
	client               *ent.Client
	httpClient           *resty.Client
	rrCounter            atomic.Uint64
	stickySessionService *StickySessionService
}

// NewService 创建 Codex responses 代理服务。
func NewService(client *ent.Client) *Service {
	httpClient := resty.New()
	httpClient.SetTimeout(0)

	return &Service{
		client:               client,
		httpClient:           httpClient,
		stickySessionService: NewStickySessionService(defaultStickyTTL),
	}
}

// ProxyResponses 将请求转发到上游并回传响应内容。
func (s *Service) ProxyResponses(c *gin.Context, body []byte) (CallLog, error) {
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
	isSSE := false
	if payload.Stream {
		streaming, err := s.forwardSSEWithEventSource(c, body, upstreamHeaders, &usage)
		if err != nil {
			return CallLog{
				UserAgent:   userAgent,
				ClientIP:    clientIP,
				AccountID:   account.AccountID,
				AccountName: account.Name,
				IsSSE:       streaming,
			}, err
		}
		isSSE = streaming
	} else {
		upstreamResp, err := s.sendUpstreamRequest(c, body, upstreamHeaders)
		if err != nil {
			return CallLog{
				UserAgent:   userAgent,
				ClientIP:    clientIP,
				AccountID:   account.AccountID,
				AccountName: account.Name,
				IsSSE:       false,
			}, err
		}
		defer func() {
			_ = upstreamResp.Body.Close()
		}()
		s.forwardHTTP(c, upstreamResp.RawResponse, &usage)
		isSSE = false
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

// WriteCallLog 持久化一次代理调用日志。
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

// ListResponseLogsPage 分页查询调用日志。
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

// sendUpstreamRequest 构造并发送到上游 Codex 的 HTTP 请求。
func (s *Service) sendUpstreamRequest(c *gin.Context, body []byte, headers http.Header) (*resty.Response, error) {
	req := s.httpClient.R().
		SetContext(c.Request.Context()).
		SetBody(body).
		SetDoNotParseResponse(true)

	req.SetHeaderMultiValues(headers)

	resp, err := req.Post(codexResponsesURL)
	if err != nil {
		return nil, ErrUpstreamRequestFail
	}
	return resp, nil
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

// selectAccount 依据粘滞策略与轮询选择可用账户。
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

// forwardHTTP 透传普通 HTTP 响应并提取 token 使用量。
func (s *Service) forwardHTTP(c *gin.Context, upstreamResp *http.Response, usage *tokenUsage) {
	body, err := io.ReadAll(upstreamResp.Body)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	parsedUsage := parseUsageFromResponseBody(body)
	usage.InputTokens = parsedUsage.InputTokens
	usage.CachedInputTokens = parsedUsage.CachedInputTokens
	usage.OutputTokens = parsedUsage.OutputTokens

	writeHTTPResponse(c, upstreamResp.StatusCode, upstreamResp.Header, body)
}

// forwardSSEWithEventSource 使用 Resty v3 EventSource 透传 SSE 并持续更新 token 使用量。
func (s *Service) forwardSSEWithEventSource(c *gin.Context, body []byte, headers http.Header, usage *tokenUsage) (bool, error) {
	type sseMessage struct {
		name string
		data string
	}
	type failureResponse struct {
		statusCode int
		headers    http.Header
		body       []byte
	}

	es := resty.NewEventSource().
		SetURL(codexResponsesURL).
		SetMethod(resty.MethodPost).
		SetBody(bytes.NewReader(body)).
		SetRetryCount(0)
	for key, values := range headers {
		for _, value := range values {
			es.AddHeader(key, value)
		}
	}

	clientChan := make(chan sseMessage)
	esDone := make(chan struct{})
	isSSE := false
	var streamErr error
	var failedResp *failureResponse

	es.OnOpen(func(_ string, responseHeaders http.Header) {
		isSSE = true
		copyResponseHeaders(c.Writer.Header(), responseHeaders)
		c.Status(http.StatusOK)
	})

	es.OnRequestFailure(func(_ error, response *http.Response) {
		if response == nil {
			return
		}
		defer func() {
			_ = response.Body.Close()
		}()

		responseBody, readErr := io.ReadAll(response.Body)
		if readErr != nil {
			streamErr = readErr
			return
		}
		failedResp = &failureResponse{
			statusCode: response.StatusCode,
			headers:    response.Header.Clone(),
			body:       responseBody,
		}
	})

	es.OnMessage(func(eventAny any) {
		event := eventAny.(*resty.Event)
		updateUsageFromSSEEventData(event.Data, usage)
		clientChan <- sseMessage{
			name: event.Name,
			data: event.Data,
		}
	}, nil)

	done := make(chan struct{})
	go func() {
		select {
		case <-c.Request.Context().Done():
			es.Close()
		case <-done:
		}
	}()
	defer close(done)

	go func() {
		defer close(esDone)
		err := es.Get()
		if err != nil && !errors.Is(err, io.EOF) {
			streamErr = err
		}
		close(clientChan)
	}()

	c.Stream(func(w io.Writer) bool {
		if msg, ok := <-clientChan; ok {
			c.SSEvent(msg.name, msg.data)
			return true
		}
		return false
	})

	<-esDone
	if failedResp != nil {
		writeHTTPResponse(c, failedResp.statusCode, failedResp.headers, failedResp.body)
		return false, nil
	}
	if streamErr != nil && c.Request.Context().Err() == nil {
		return isSSE, ErrUpstreamRequestFail
	}
	return isSSE, nil
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

// writeHTTPResponse 按上游响应状态与头部写回下游。
func writeHTTPResponse(c *gin.Context, statusCode int, headers http.Header, body []byte) {
	copyResponseHeaders(c.Writer.Header(), headers)
	c.Status(statusCode)
	_, _ = c.Writer.Write(body)
}

// parseUsageFromResponseBody 从普通 JSON 响应中提取 usage 字段。
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

// updateUsageFromSSEDataLine 从 SSE data 行里提取并更新 usage。
func updateUsageFromSSEDataLine(line string, usage *tokenUsage) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "data:") {
		return
	}

	rawJSON := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
	updateUsageFromSSEEventData(rawJSON, usage)
}

// updateUsageFromSSEEventData 从 SSE 事件 data 字段里提取并更新 usage。
func updateUsageFromSSEEventData(rawJSON string, usage *tokenUsage) {
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
