package holiday

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"golang.org/x/sync/errgroup"
)

// Refresher 刷新节假日安排：启动时一次，之后每天北京时间 4:30 一次。
type Refresher struct {
	source *Source
	store  *Store
}

func NewRefresher(source *Source, store *Store) *Refresher {
	return &Refresher{source: source, store: store}
}

// Startup 是启动时的那次刷新，它做完服务才开始监听。
//
// 库里已经有今年的安排就不等，pending 为 true，交给 [Refresher.Run] 在后台去拉，拉不到只记日志——数据源在 GitHub 上，
// 偶尔又慢又连不上，不该因此起不来。连今年的都没有才当场拉完，拉不到就拒绝启动，免得接口带着空表一直按周末规则回错误答案。
func (r *Refresher) Startup(ctx context.Context) (pending bool, err error) {
	has, err := r.store.HasYear(ctx, Today().Year())
	if err != nil {
		return false, fmt.Errorf("查询库里有没有今年的节假日安排失败: %w", err)
	}
	if has {
		return true, nil
	}
	if err := r.upcomingYears(ctx); err != nil {
		return false, fmt.Errorf("库里没有今年的节假日安排，启动时又没拉到: %w", err)
	}
	return false, nil
}

// Run 在后台刷新，直到 ctx 取消：先补上 [Refresher.Startup] 留下的那次，之后每天北京时间 4:30 一次。
//
// 数据源一年只更新几次（次年安排公布、临时调休），每天拉一次足够。失败只记日志，第二天再试。
func (r *Refresher) Run(ctx context.Context, pending bool) {
	if pending {
		logFailure(ctx, "启动时刷新节假日数据失败，先用库里已有的数据", r.upcomingYears(ctx))
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(nextDaily(time.Now()))):
		}
		logFailure(ctx, "定时刷新节假日数据失败", r.upcomingYears(ctx))
	}
}

// logFailure 记下刷新失败；关停时被取消的不算。
func logFailure(ctx context.Context, message string, err error) {
	if err != nil && ctx.Err() == nil {
		slog.Error(message, "err", err)
	}
}

// nextDaily 是 now 之后的下一个北京时间 4:30。
func nextDaily(now time.Time) time.Time {
	now = now.In(china)
	next := time.Date(now.Year(), now.Month(), now.Day(), 4, 30, 0, 0, china)
	if !next.After(now) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

// upcomingYears 刷新当年和次年。年份每次重新算，跨年后自然带上新的次年；两年互不依赖所以并行，任一失败即整体失败。
func (r *Refresher) upcomingYears(ctx context.Context) error {
	year := Today().Year()
	group, ctx := errgroup.WithContext(ctx)
	for _, y := range []int{year, year + 1} {
		group.Go(func() error { return r.OneYear(ctx, y) })
	}
	return group.Wait()
}

// OneYear 刷新一整年。
func (r *Refresher) OneYear(ctx context.Context, year int) error {
	// 拉取放在事务外，免得一次慢请求白占着数据库连接
	days, err := r.source.FetchYear(ctx, year)
	if err != nil {
		return err
	}
	// 拉到空的就不动库：一年的安排公布之后不会变回没有，拉到空的只能是还没发布，
	// 或者数据源出了岔子（路径变了、全回 404），这时先删后插只会把已有的安排清掉
	if len(days) == 0 {
		slog.Info("节假日安排还没有发布", "year", year)
		return nil
	}
	if err := r.store.ReplaceYear(ctx, year, days); err != nil {
		return fmt.Errorf("写入 %d 年的节假日安排失败: %w", year, err)
	}
	slog.Info("已刷新节假日数据", "year", year, "days", len(days))
	return nil
}
