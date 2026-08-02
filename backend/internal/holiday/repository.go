package holiday

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"
)

// Repository 封装 holiday_days 表的数据访问。
type Repository struct {
	db *sqlx.DB
}

// NewRepository 创建仓储实例。
func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

// FindOffDay 查询指定日期的休息日标记。
// found 为 false 表示库中无该日期记录。
func (r *Repository) FindOffDay(ctx context.Context, date string) (isOffDay bool, found bool, err error) {
	err = r.db.GetContext(ctx, &isOffDay,
		`SELECT is_off_day FROM holiday_days WHERE date = $1 LIMIT 1`, date)
	if errors.Is(err, sql.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, fmt.Errorf("查询 %s 节假日记录失败: %w", date, err)
	}
	return isOffDay, true, nil
}

// ReplaceYear 以「先删后插」的方式刷新指定年份的数据，整体在一个事务内完成。
func (r *Repository) ReplaceYear(ctx context.Context, year int, days []DaySnapshot) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	// 提交成功后 Rollback 是空操作，可安全 defer
	defer func() { _ = tx.Rollback() }()

	// 删除该年份的旧数据
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM holiday_days WHERE date LIKE $1`, fmt.Sprintf("%d-%%", year)); err != nil {
		return fmt.Errorf("删除 %d 年旧数据失败: %w", year, err)
	}

	// 批量插入新数据
	if len(days) > 0 {
		if _, err := tx.NamedExecContext(ctx,
			`INSERT INTO holiday_days (name, date, is_off_day) VALUES (:name, :date, :isOffDay)`,
			toInsertParams(days)); err != nil {
			return fmt.Errorf("插入 %d 年节假日数据失败: %w", year, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	return nil
}

// insertParam 是批量插入使用的命名参数结构。
type insertParam struct {
	Name     string `db:"name"`
	Date     string `db:"date"`
	IsOffDay bool   `db:"isOffDay"`
}

// toInsertParams 将远程快照转换为插入参数。
func toInsertParams(days []DaySnapshot) []insertParam {
	params := make([]insertParam, len(days))
	for i, d := range days {
		params[i] = insertParam{Name: d.Name, Date: d.Date, IsOffDay: d.IsOffDay}
	}
	return params
}
