package holiday

import (
	"context"
	"fmt"
	"time"

	"myapi/internal/ent"
	"myapi/internal/ent/holidayday"
)

// Service 管理节假日查询能力。
type Service struct {
	client *ent.Client
}

// NewService 初始化当年与下一年的节假日数据。
func NewService(client *ent.Client) (*Service, error) {
	ctx := context.Background()
	service := &Service{client: client}
	now := time.Now()
	currentYear := now.Year()
	nextYear := currentYear + 1

	for _, year := range []int{currentYear, nextYear} {
		if err := service.refreshYearDays(ctx, year); err != nil {
			return nil, err
		}
	}
	return service, nil
}

// IsHoliday 判断日期是否为休息日。
func (s *Service) IsHoliday(ctx context.Context, date time.Time) (bool, error) {
	dateText := date.Format(DateLayout)
	day, err := s.client.HolidayDay.Query().Where(holidayday.DateEQ(dateText)).Only(ctx)
	if err == nil {
		return day.IsOffDay, nil
	}
	if !ent.IsNotFound(err) {
		return false, fmt.Errorf("查询节假日数据失败: %w", err)
	}

	weekDay := date.Weekday()
	return weekDay == time.Saturday || weekDay == time.Sunday, nil
}

// QueryNextOffDay 查询下一个休息日信息。
func (s *Service) QueryNextOffDay(ctx context.Context, date time.Time) (NextOffDayResult, error) {
	for days := 0; ; days++ {
		candidate := date.AddDate(0, 0, days)
		isHoliday, err := s.IsHoliday(ctx, candidate)
		if err != nil {
			return NextOffDayResult{}, err
		}
		if isHoliday {
			return NextOffDayResult{
				NextOffDayDate:   candidate.Format(DateLayout),
				DaysToNextOffDay: days,
			}, nil
		}
	}
}

// refreshYearDays 刷新指定年份的节假日数据。
func (s *Service) refreshYearDays(ctx context.Context, year int) error {
	days, err := fetchYearDays(year)
	if err != nil {
		return err
	}

	yearPrefix := fmt.Sprintf("%d-", year)
	if _, err = s.client.HolidayDay.Delete().Where(holidayday.DateHasPrefix(yearPrefix)).Exec(ctx); err != nil {
		return fmt.Errorf("删除节假日数据失败: %w", err)
	}

	builders := make([]*ent.HolidayDayCreate, 0, len(days))
	for _, day := range days {
		builders = append(builders, s.client.HolidayDay.Create().
			SetName(day.Name).
			SetDate(day.Date).
			SetIsOffDay(day.IsOffDay))
	}
	if len(builders) == 0 {
		return nil
	}

	if err = s.client.HolidayDay.CreateBulk(builders...).Exec(ctx); err != nil {
		return fmt.Errorf("写入节假日数据失败: %w", err)
	}
	return nil
}
