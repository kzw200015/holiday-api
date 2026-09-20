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

// UserState 是本站账号自己的那部分状态：浏览偏好、搜索历史、阅读进度。
// 它们都只住在本站的库里，跟 e 站上游没有关系——所以这里不认识 Client，也不签名任何地址。
//
// 单独成一个协作者，是为了让 Service 不再直接握着 *store.Queries：
// Service 的活是编排用例（取元数据、拼签名地址、决定并发），SQL 在哪张表上怎么写是这里的事。
// 它和 CredentialStore、ImageLocator 一样由 wire 建好再交给 Service；区别是它被内嵌，
// 方法直接提升成 Service 的对外方法，不必再写一层同名转发。
type UserState struct {
	queries *store.Queries
}

func NewUserState(queries *store.Queries) *UserState {
	return &UserState{queries: queries}
}

// Preferences 是跨设备共享的图集浏览偏好，不包含页面草稿或自动翻页开关。
type Preferences struct {
	Categories     []string `json:"categories"`
	ReaderInterval int32    `json:"readerInterval"`
}

func (s *UserState) Preferences(ctx context.Context, userID int64) (Preferences, error) {
	row, err := s.queries.GetEhPreferences(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Preferences{Categories: []string{}, ReaderInterval: 5}, nil
	}
	return Preferences{Categories: row.Categories, ReaderInterval: row.ReaderInterval}, err
}

// SavePreferences 整份替换浏览偏好。
//
// 不回存下来的那一份：前端以它本地那份为准，不拿响应回写。整份提交意味着按到达顺序覆盖，
// 另一台设备刚改的会被这一份盖掉——这是拿本地当真源换来的，见 AGENTS.md 的前端数据层。
func (s *UserState) SavePreferences(ctx context.Context, userID int64, preferences Preferences) error {
	if _, err := toCategoryFilter(preferences.Categories); err != nil {
		return err
	}
	if preferences.ReaderInterval < 1 || preferences.ReaderInterval > 20 {
		return apperr.New(apperr.InvalidArgument, "自动翻页间隔应为 1–20 秒")
	}
	return s.queries.SaveEhPreferences(ctx, store.SaveEhPreferencesParams{
		UserID:         userID,
		Categories:     normalizeCategories(preferences.Categories),
		ReaderInterval: preferences.ReaderInterval,
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

func (s *UserState) SearchHistory(ctx context.Context, userID int64) ([]string, error) {
	history, err := s.queries.GetEhSearchHistory(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return []string{}, nil
	}
	return history, err
}

// 一份搜索历史最多留几条。超出就退回去，而不是替前端截断：条数是前端那边的展示规则，
// 这里只确认它没越界——列也有同样的 CHECK，两边对不上时报错比静默改数据好排查。
const searchHistoryLimit = 10

// SaveSearchHistory 整份替换搜索历史。
//
// 哪条在前、要不要去重、留几条都是前端定的，这里只做落不进库才需要拦的那几项校验，
// 以及去掉关键词两端的空白（前端提交前已经去过，这里是兜底）。
func (s *UserState) SaveSearchHistory(ctx context.Context, userID int64, entries []string) error {
	if len(entries) > searchHistoryLimit {
		return apperr.New(apperr.InvalidArgument, "搜索历史最多 %d 条", searchHistoryLimit)
	}
	cleaned := make([]string, 0, len(entries))
	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		if entry == "" || len(entry) > 200 {
			return apperr.New(apperr.InvalidArgument, "搜索历史关键词应为 1–200 字节")
		}
		cleaned = append(cleaned, entry)
	}
	return s.queries.SaveEhSearchHistory(ctx, store.SaveEhSearchHistoryParams{UserID: userID, SearchHistory: cleaned})
}

// ReadingPosition 是一次阅读进度上报，也是 POST /api/eh/progress 的请求体。
type ReadingPosition struct {
	GID   int64  `json:"gid"`
	Token string `json:"token"`
	Page  int32  `json:"page"`
}

// SaveProgress 记下读到第几页。同一个图集只留一条，重复上报就覆盖。
func (s *UserState) SaveProgress(ctx context.Context, userID int64, position ReadingPosition) error {
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
func (s *UserState) progressOf(ctx context.Context, userID int64, ref GalleryRef) (*int32, error) {
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
func (s *UserState) RemoveReadingHistory(ctx context.Context, userID, gid int64) error {
	if err := checkGID(gid); err != nil {
		return err
	}
	return s.queries.DeleteReadingProgress(ctx, store.DeleteReadingProgressParams{UserID: userID, Gid: gid})
}

func (s *UserState) ClearReadingHistory(ctx context.Context, userID int64) error {
	return s.queries.ClearReadingProgress(ctx, userID)
}

const historyPageSize = 25

// 阅读历史的一页原始记录，元数据由 Service 另外补。
// 多取一条来判断还有没有下一页，返回时已经去掉。
func (s *UserState) readingHistoryPage(ctx context.Context, userID int64, cursor string) (
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
