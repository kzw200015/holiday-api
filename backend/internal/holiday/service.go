package holiday

import "time"

// Service 管理节假日查询能力。
type Service struct {
	byDate map[string]Day
}

// NewService 初始化当年与下一年的节假日索引。
func NewService(now time.Time) (*Service, error) {
	currentYear := now.Year()
	nextYear := currentYear + 1

	byDate := make(map[string]Day)
	for _, year := range []int{currentYear, nextYear} {
		days, err := fetchYearDays(year)
		if err != nil {
			return nil, err
		}
		for _, day := range days {
			byDate[day.Date] = day
		}
	}
	return &Service{byDate: byDate}, nil
}

// IsHoliday 判断日期是否为休息日。
func (s *Service) IsHoliday(date time.Time) bool {
	dateText := date.Format(DateLayout)
	if day, ok := s.byDate[dateText]; ok {
		return day.IsOffDay
	}
	weekDay := date.Weekday()
	return weekDay == time.Saturday || weekDay == time.Sunday
}
