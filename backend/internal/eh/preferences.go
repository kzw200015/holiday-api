package eh

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"myapi/internal/apperr"
	"myapi/internal/store"
)

// Preferences 是跨设备共享的图集浏览偏好，不包含页面草稿或自动翻页开关。
type Preferences struct {
	Categories     []string `json:"categories"`
	ReaderInterval int32    `json:"readerInterval"`
}

func (s *Service) Preferences(ctx context.Context, userID int64) (Preferences, error) {
	row, err := s.queries.GetEhPreferences(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Preferences{Categories: []string{}, ReaderInterval: 5}, nil
	}
	return Preferences{Categories: row.Categories, ReaderInterval: row.ReaderInterval}, err
}

func (s *Service) SaveCategories(ctx context.Context, userID int64, categories []string) error {
	if _, err := toCategoryFilter(categories); err != nil {
		return err
	}
	categories = slices.Clone(categories)
	slices.Sort(categories)
	categories = slices.Compact(categories)
	if categories == nil {
		categories = []string{}
	}
	return s.queries.SaveEhCategories(ctx, store.SaveEhCategoriesParams{UserID: userID, Categories: categories})
}

func (s *Service) SaveReaderInterval(ctx context.Context, userID int64, interval int32) error {
	if interval < 1 || interval > 20 {
		return apperr.New(apperr.InvalidArgument, "自动翻页间隔应为 1–20 秒")
	}
	return s.queries.SaveEhReaderInterval(ctx, store.SaveEhReaderIntervalParams{UserID: userID, ReaderInterval: interval})
}

func (s *Service) SearchHistory(ctx context.Context, userID int64) ([]string, error) {
	history, err := s.queries.GetEhSearchHistory(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return []string{}, nil
	}
	return history, err
}

func (s *Service) RecordSearch(ctx context.Context, userID int64, keyword string) ([]string, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" || len(keyword) > 200 {
		return nil, apperr.New(apperr.InvalidArgument, "搜索历史关键词应为 1–200 字节")
	}
	return s.queries.RecordEhSearch(ctx, store.RecordEhSearchParams{UserID: userID, Keyword: keyword})
}

func (s *Service) RemoveSearch(ctx context.Context, userID int64, keyword string) ([]string, error) {
	history, err := s.queries.RemoveEhSearch(ctx, store.RemoveEhSearchParams{UserID: userID, Keyword: keyword})
	if errors.Is(err, pgx.ErrNoRows) {
		return []string{}, nil
	}
	return history, err
}

func (s *Service) ClearSearchHistory(ctx context.Context, userID int64) error {
	return s.queries.ClearEhSearchHistory(ctx, userID)
}
