package codexproxy

import (
	"context"
	"log/slog"
	"time"

	"myapi/internal/ent"
	"myapi/internal/ent/codexresponselog"
	"myapi/internal/pagination"
)

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

type LogService struct {
	client *ent.Client
}

// NewLogService 创建 Codex 响应日志服务。
func NewLogService(client *ent.Client) *LogService {
	return &LogService{client: client}
}

// WriteCallLog 持久化一次代理调用日志。
func (s *LogService) WriteCallLog(ctx context.Context, callLog CallLog) error {
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
	if err != nil {
		slog.ErrorContext(ctx, "write codex response log failed", "err", err)
		return err
	}
	return nil
}

// ListResponseLogsPage 分页查询调用日志。
func (s *LogService) ListResponseLogsPage(ctx context.Context, page int, pageSize int) (pagination.PaginatedResult[ResponseLogItem], error) {
	total, err := s.client.CodexResponseLog.Query().Count(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "count codex response logs failed", "err", err)
		return pagination.PaginatedResult[ResponseLogItem]{}, err
	}

	logs, err := s.client.CodexResponseLog.Query().
		Order(ent.Desc(codexresponselog.FieldCreatedAt), ent.Desc(codexresponselog.FieldID)).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		All(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "list codex response logs failed", "err", err, "page", page, "page_size", pageSize)
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
