package eh

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"time"

	"myapi/internal/apperr"
	"myapi/internal/eh/store"
)

const historyPageSize = 25

// ReadingHistoryItem 保留进度标识；元数据不可访问时 Gallery 为空，但记录仍可删除。
type ReadingHistoryItem struct {
	GID     int64        `json:"gid"`
	Token   string       `json:"token"`
	Page    int32        `json:"page"`
	ReadAt  time.Time    `json:"readAt"`
	Gallery *GalleryCard `json:"gallery"`
}

type ReadingHistoryPage struct {
	Items      []ReadingHistoryItem `json:"items"`
	NextCursor *string              `json:"nextCursor"`
}

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

func (s *Service) ReadingHistory(ctx context.Context, userID int64, value string) (ReadingHistoryPage, error) {
	cursor, err := parseHistoryCursor(value)
	if err != nil {
		return ReadingHistoryPage{}, err
	}
	rows, err := s.queries.ListReadingHistory(ctx, store.ListReadingHistoryParams{
		UserID: userID, HasCursor: value != "", BeforeAt: cursor.ReadAt, BeforeGid: cursor.GID,
		PageLimit: historyPageSize + 1,
	})
	if err != nil {
		return ReadingHistoryPage{}, err
	}
	result := ReadingHistoryPage{Items: make([]ReadingHistoryItem, 0, min(len(rows), historyPageSize))}
	if len(rows) > historyPageSize {
		rows = rows[:historyPageSize]
		last := rows[len(rows)-1]
		encoded, err := json.Marshal(historyCursor{ReadAt: last.UpdatedAt, GID: last.Gid})
		if err != nil {
			return ReadingHistoryPage{}, err
		}
		next := base64.RawURLEncoding.EncodeToString(encoded)
		result.NextCursor = &next
	}
	refs := make([]GalleryRef, len(rows))
	for i, row := range rows {
		refs[i] = GalleryRef{GID: row.Gid, Token: row.Token}
	}
	galleries, err := s.loadGalleries(ctx, refs)
	if err != nil {
		// 整批请求失败是可重试错误，不能把网络故障伪装成所有图集失效。
		return ReadingHistoryPage{}, err
	}
	for _, row := range rows {
		item := ReadingHistoryItem{GID: row.Gid, Token: row.Token, Page: row.Page, ReadAt: row.UpdatedAt}
		if gallery, ok := galleries[GalleryRef{GID: row.Gid, Token: row.Token}]; ok {
			card := s.galleryCard(gallery)
			item.Gallery = &card
		}
		result.Items = append(result.Items, item)
	}
	return result, nil
}

func (s *Service) RemoveReadingHistory(ctx context.Context, userID, gid int64) error {
	return s.queries.DeleteReadingProgress(ctx, store.DeleteReadingProgressParams{UserID: userID, Gid: gid})
}

func (s *Service) ClearReadingHistory(ctx context.Context, userID int64) error {
	return s.queries.ClearReadingProgress(ctx, userID)
}
