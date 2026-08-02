package holiday

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// Service 实现节假日相关的业务逻辑。
type Service struct {
	repo   *Repository
	remote *RemoteClient
	logger *slog.Logger
}

// NewService 创建业务服务实例。
func NewService(repo *Repository, remote *RemoteClient, logger *slog.Logger) *Service {
	return &Service{repo: repo, remote: remote, logger: logger}
}

// IsHoliday 判断指定日期是否为休息日：先查库，无记录则按周末判断。
func (s *Service) IsHoliday(ctx context.Context, date time.Time) (bool, error) {
	isOffDay, found, err := s.repo.FindOffDay(ctx, date.Format(DateLayout))
	if err != nil {
		return false, err
	}
	if found {
		return isOffDay, nil
	}
	// 无记录，按周末判断
	weekday := date.Weekday()
	return weekday == time.Saturday || weekday == time.Sunday, nil
}

// InitCurrentAndNextYear 在启动时刷新当年和下一年的节假日数据。
func (s *Service) InitCurrentAndNextYear(ctx context.Context) error {
	currentYear := time.Now().Year()
	for _, year := range []int{currentYear, currentYear + 1} {
		if err := s.refreshYear(ctx, year); err != nil {
			return err
		}
	}
	return nil
}

// refreshYear 刷新指定年份的节假日数据。
func (s *Service) refreshYear(ctx context.Context, year int) error {
	remoteDays, err := s.remote.FetchYearDays(ctx, year)
	if err != nil {
		return err
	}
	if err := s.repo.ReplaceYear(ctx, year, remoteDays); err != nil {
		return err
	}
	s.logger.Info(fmt.Sprintf("已刷新 %d 年节假日数据，共 %d 条", year, len(remoteDays)))
	return nil
}
