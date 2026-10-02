// Package holiday 是节假日查询：某一天是不是休息日，以及节假日安排的拉取与刷新。
package holiday

import (
	"context"
	"time"
)

// china 是北京时间。节假日安排是中国的：「今天」「今年」一律按北京时间算，不跟着服务器的时区走（容器默认是 UTC）。
// 中国自 1991 年起不再实行夏令时，固定 UTC+8，用不着时区库。
var china = time.FixedZone("Asia/Shanghai", 8*60*60)

// Today 是北京时间的今天。
func Today() time.Time {
	y, m, d := time.Now().In(china).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// Day 是某一天是不是休息日。节假日安排里的一行也是它。
type Day struct {
	// Date 是那一天，UTC 零点
	Date     time.Time
	IsOffDay bool
	// Name 是节假日名称；为空表示这一天不在节假日安排里（普通工作日或普通周末）
	Name string
}

// Service 回答某一天是不是休息日。
type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

// Day 是某一天是不是休息日：节假日安排里有的按安排，没有的按周末判断，此时名称为空。
func (s *Service) Day(ctx context.Context, date time.Time) (Day, error) {
	day, found, err := s.store.Find(ctx, date)
	if err != nil || found {
		return day, err
	}
	weekday := date.Weekday()
	return Day{Date: date, IsOffDay: weekday == time.Saturday || weekday == time.Sunday}, nil
}
