// Package holiday 是节假日查询：本地表命中就用表里的，没有就按周末判断；
// 数据来自 holiday-cn 仓库，启动时拉一次，之后定时刷新。
package holiday

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"

	"myapi/internal/store"
)

// 日期在库列、接口出入参和远程 JSON 里统一是 YYYY-MM-DD 字符串（标准库的 time.DateOnly）；
// 业务层按 time.Time 传递，只在边界上转换。time.Parse 用这个布局时位数是严格的
//（拒绝 2024-1-1），也会拒绝日历上不存在的日期（2024-02-31），不用再另外校验。

// Day 是单日的节假日数据：远程 JSON 里 days 数组的元素结构，也是 detail 接口的响应体。
// 字段的声明顺序即 JSON 的序列化顺序。
type Day struct {
	Date     string `json:"date"`
	IsOffDay bool   `json:"isOffDay"`
	// 为空表示该日期不在节假日表中，即普通工作日或普通周末。
	Name string `json:"name"`
}

// Service 是节假日业务逻辑，直接操作 holiday_days 表：
// 查询条件与「年份即 date 列前缀」这类存储约定都写在这里，没有单独的数据访问层。
type Service struct {
	pool    *pgxpool.Pool
	queries *store.Queries
	remote  *RemoteClient
}

func NewService(pool *pgxpool.Pool, queries *store.Queries, remote *RemoteClient) *Service {
	return &Service{pool: pool, queries: queries, remote: remote}
}

// Query 查某一天是否休息及对应的节假日名称：先查库，无记录则按周末判断（此时名称为空）。
func (s *Service) Query(ctx context.Context, date time.Time) (Day, error) {
	text := date.Format(time.DateOnly)

	day, err := s.queries.GetHolidayDayByDate(ctx, text)
	if errors.Is(err, pgx.ErrNoRows) {
		// 表中没有安排的日期按周末判断；数据库故障不能当成普通日期。
		weekday := date.Weekday()
		return Day{Date: text, IsOffDay: weekday == time.Saturday || weekday == time.Sunday}, nil
	}
	if err != nil {
		return Day{}, err
	}
	return Day{Date: text, IsOffDay: day.IsOffDay, Name: day.Name}, nil
}

// RefreshYear 刷新指定年份：远程拉取后以「先删后插」替换该年数据。
func (s *Service) RefreshYear(ctx context.Context, year int) error {
	// 远程拉取放在事务外，避免一次最长 60 秒的 HTTP 调用白占着数据库连接
	days, err := s.remote.FetchYear(ctx, year)
	if err != nil {
		return err
	}

	params := store.InsertHolidayDaysParams{
		Names:     make([]string, len(days)),
		Dates:     make([]string, len(days)),
		IsOffDays: make([]bool, len(days)),
	}
	for i, day := range days {
		params.Names[i], params.Dates[i], params.IsOffDays[i] = day.Name, day.Date, day.IsOffDay
	}

	// 删和插在一个事务里完成，中途出错即回滚，不会留下「旧数据没了新数据也没进来」的空年份
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // 已提交后再回滚是空操作

	queries := s.queries.WithTx(tx)
	if err := queries.DeleteHolidayDaysByYearPrefix(ctx, fmt.Sprintf("%d-%%", year)); err != nil {
		return err
	}
	// 远程为空时（次年安排还没发布）插 0 行，不需要特判
	if err := queries.InsertHolidayDays(ctx, params); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	slog.Info("已刷新节假日数据", "year", year, "count", len(days))
	return nil
}

// RefreshUpcomingYears 刷新当年和次年。两年互不依赖所以并行拉取，任一失败即整体失败（另一年仍会跑完）。
// 年份每次重新计算，跨年后定时刷新会自动带上新的次年。
func (s *Service) RefreshUpcomingYears(ctx context.Context) error {
	year := time.Now().Year()
	group, groupCtx := errgroup.WithContext(ctx)
	for _, each := range [2]int{year, year + 1} {
		group.Go(func() error { return s.RefreshYear(groupCtx, each) })
	}
	return group.Wait()
}

// StartRefreshLoop 按固定间隔重复刷新，跟上数据源的更新（次年安排公布、临时调休）。
// 与启动时那次不同，这里失败只记日志不退出：库里已有可用数据，等下个周期重试即可。
func (s *Service) StartRefreshLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.RefreshUpcomingYears(ctx); err != nil {
				slog.Error("定时刷新节假日数据失败", "err", err)
			}
		}
	}
}
