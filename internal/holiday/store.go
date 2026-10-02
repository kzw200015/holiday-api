package holiday

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kzw200015/myapi/internal/holiday/db"
)

// Store 是节假日安排在库里的读写，SQL 在 queries.sql 里。
type Store struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool, queries: db.New(pool)}
}

// Find 是节假日安排里这一天的那一行；不在安排里时 found 为 false。
func (s *Store) Find(ctx context.Context, date time.Time) (day Day, found bool, err error) {
	row, err := s.queries.FindDay(ctx, date)
	if errors.Is(err, pgx.ErrNoRows) {
		return Day{}, false, nil
	}
	if err != nil {
		return Day{}, false, err
	}
	return Day{Date: row.Date, IsOffDay: row.IsOffDay, Name: row.Name}, true, nil
}

// HasYear 是库里有没有这一年的安排。
func (s *Store) HasYear(ctx context.Context, year int) (bool, error) {
	return s.queries.HasYear(ctx, int32(year))
}

// ReplaceYear 以「先删后插」替换一整年。删和插在一个事务里：中途出错即回滚，不会留下「旧的没了、新的也没进来」的空年份。
func (s *Store) ReplaceYear(ctx context.Context, year int, days []Day) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		queries := s.queries.WithTx(tx)
		if err := queries.DeleteYear(ctx, int32(year)); err != nil {
			return err
		}
		rows := make([]db.InsertDaysParams, len(days))
		for i, day := range days {
			rows[i] = db.InsertDaysParams{Date: day.Date, IsOffDay: day.IsOffDay, Name: day.Name}
		}
		_, err := queries.InsertDays(ctx, rows)
		return err
	})
}
