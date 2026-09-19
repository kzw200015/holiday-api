package eh

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"myapi/internal/apperr"
	"myapi/internal/eh/store"
)

// userState 是本站账号自己的那部分状态：浏览偏好、搜索历史、阅读进度。
// 它们都只住在本站的库里，跟 e 站上游没有关系——所以这里不认识 Client，也不签名任何地址。
//
// 单独成一个协作者，是为了让 Service 不再直接握着 *store.Queries：
// Service 的活是编排用例（取元数据、拼签名地址、决定并发），SQL 在哪张表上怎么写是这里的事。
// 它被 Service 内嵌，方法直接提升成 Service 的对外方法，不必再写一层同名转发。
type userState struct {
	queries *store.Queries
}

func newUserState(queries *store.Queries) *userState {
	return &userState{queries: queries}
}

// Preferences 是跨设备共享的图集浏览偏好，不包含页面草稿或自动翻页开关。
type Preferences struct {
	Categories     []string `json:"categories"`
	ReaderInterval int32    `json:"readerInterval"`
}

func (s *userState) Preferences(ctx context.Context, userID int64) (Preferences, error) {
	row, err := s.queries.GetEhPreferences(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Preferences{Categories: []string{}, ReaderInterval: 5}, nil
	}
	return Preferences{Categories: row.Categories, ReaderInterval: row.ReaderInterval}, err
}

func (s *userState) SaveCategories(ctx context.Context, userID int64, categories []string) error {
	if _, err := toCategoryFilter(categories); err != nil {
		return err
	}
	return s.queries.SaveEhCategories(ctx, store.SaveEhCategoriesParams{
		UserID: userID, Categories: normalizeCategories(categories),
	})
}

// 排序去重后入库，存的始终是同一种写法；空集合用空切片而不是 nil，列存到库里才是 {} 而不是 NULL。
func normalizeCategories(categories []string) []string {
	normalized := slices.Clone(categories)
	slices.Sort(normalized)
	normalized = slices.Compact(normalized)
	if normalized == nil {
		return []string{}
	}
	return normalized
}

func (s *userState) SaveReaderInterval(ctx context.Context, userID int64, interval int32) error {
	if interval < 1 || interval > 20 {
		return apperr.New(apperr.InvalidArgument, "自动翻页间隔应为 1–20 秒")
	}
	return s.queries.SaveEhReaderInterval(ctx, store.SaveEhReaderIntervalParams{UserID: userID, ReaderInterval: interval})
}

func (s *userState) SearchHistory(ctx context.Context, userID int64) ([]string, error) {
	history, err := s.queries.GetEhSearchHistory(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return []string{}, nil
	}
	return history, err
}

func (s *userState) RecordSearch(ctx context.Context, userID int64, keyword string) ([]string, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" || len(keyword) > 200 {
		return nil, apperr.New(apperr.InvalidArgument, "搜索历史关键词应为 1–200 字节")
	}
	return s.queries.RecordEhSearch(ctx, store.RecordEhSearchParams{UserID: userID, Keyword: keyword})
}

func (s *userState) RemoveSearch(ctx context.Context, userID int64, keyword string) ([]string, error) {
	history, err := s.queries.RemoveEhSearch(ctx, store.RemoveEhSearchParams{UserID: userID, Keyword: keyword})
	if errors.Is(err, pgx.ErrNoRows) {
		return []string{}, nil
	}
	return history, err
}

// 回一份清空后的历史（空列表），跟 RecordSearch / RemoveSearch 一样由服务端给出结果，
// 前端不必自己拼一个空列表。
func (s *userState) ClearSearchHistory(ctx context.Context, userID int64) ([]string, error) {
	if err := s.queries.ClearEhSearchHistory(ctx, userID); err != nil {
		return nil, err
	}
	return []string{}, nil
}

// ReadingPosition 是一次阅读进度上报，也是 POST /api/eh/progress 的请求体。
type ReadingPosition struct {
	GID   int64  `json:"gid"`
	Token string `json:"token"`
	Page  int32  `json:"page"`
}

// SaveProgress 记下读到第几页。同一个图集只留一条，重复上报就覆盖。
func (s *userState) SaveProgress(ctx context.Context, userID int64, position ReadingPosition) error {
	if _, err := newGalleryRef(position.GID, position.Token); err != nil {
		return err
	}
	if err := checkPage(int(position.Page)); err != nil {
		return err
	}
	return s.queries.UpsertReadingProgress(ctx, store.UpsertReadingProgressParams{
		UserID: userID, Gid: position.GID, Token: position.Token, Page: position.Page,
	})
}

// 读一本的阅读进度。没读过返回 nil，不是错误。
func (s *userState) progressOf(ctx context.Context, userID int64, ref GalleryRef) (*int32, error) {
	page, err := s.queries.GetReadingProgress(ctx, store.GetReadingProgressParams{UserID: userID, Gid: ref.GID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &page, nil
}

// RemoveReadingHistory 删一条阅读历史，对应的阅读进度一并消失（同一张表）。
func (s *userState) RemoveReadingHistory(ctx context.Context, userID, gid int64) error {
	if err := checkGID(gid); err != nil {
		return err
	}
	return s.queries.DeleteReadingProgress(ctx, store.DeleteReadingProgressParams{UserID: userID, Gid: gid})
}

func (s *userState) ClearReadingHistory(ctx context.Context, userID int64) error {
	return s.queries.ClearReadingProgress(ctx, userID)
}

const historyPageSize = 25

// 阅读历史的一页原始记录，元数据由 Service 另外补。
// 多取一条来判断还有没有下一页，返回时已经去掉。
func (s *userState) readingHistoryPage(ctx context.Context, userID int64, cursor string) (
	[]store.ListReadingHistoryRow, *string, error) {
	position, err := parseHistoryCursor(cursor)
	if err != nil {
		return nil, nil, err
	}
	rows, err := s.queries.ListReadingHistory(ctx, store.ListReadingHistoryParams{
		UserID: userID, HasCursor: cursor != "", BeforeAt: position.ReadAt, BeforeGid: position.GID,
		PageLimit: historyPageSize + 1,
	})
	if err != nil {
		return nil, nil, err
	}
	if len(rows) <= historyPageSize {
		return rows, nil, nil
	}

	rows = rows[:historyPageSize]
	next := encodeHistoryCursor(rows[len(rows)-1])
	return rows, &next, nil
}

// 游标是「上一页最后一条的时间 + gid」，编码成一段 base64 交给前端原样带回。
type historyCursor struct {
	ReadAt time.Time `json:"readAt"`
	GID    int64     `json:"gid"`
}

func parseHistoryCursor(value string) (historyCursor, error) {
	if value == "" {
		return historyCursor{}, nil
	}
	var cursor historyCursor
	if len(value) > 256 {
		return cursor, apperr.New(apperr.InvalidArgument, "阅读历史游标不合法")
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || json.Unmarshal(data, &cursor) != nil || cursor.ReadAt.IsZero() || cursor.GID <= 0 {
		return historyCursor{}, apperr.New(apperr.InvalidArgument, "阅读历史游标不合法")
	}
	return cursor, nil
}

// 只有一个时间和一个整数，序列化不会失败，所以这里不往上传一个永远为 nil 的错误。
func encodeHistoryCursor(last store.ListReadingHistoryRow) string {
	encoded, _ := json.Marshal(historyCursor{ReadAt: last.UpdatedAt, GID: last.Gid})
	return base64.RawURLEncoding.EncodeToString(encoded)
}
