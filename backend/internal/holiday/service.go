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

// Query 查询指定日期是否为休息日及对应的节假日名称：
// 先查库，无记录则按周末判断（此时名称为空）。
func (s *Service) Query(ctx context.Context, date time.Time) (QueryResult, error) {
	dateStr := date.Format(DateLayout)

	day, found, err := s.repo.FindDay(ctx, dateStr)
	if err != nil {
		return QueryResult{}, err
	}
	if found {
		return QueryResult{Date: dateStr, IsOffDay: day.IsOffDay, Name: day.Name}, nil
	}

	// 无记录，按周末判断
	weekday := date.Weekday()
	isWeekend := weekday == time.Saturday || weekday == time.Sunday
	return QueryResult{Date: dateStr, IsOffDay: isWeekend}, nil
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
