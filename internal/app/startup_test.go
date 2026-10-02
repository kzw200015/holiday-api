package app

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/kzw200015/myapi/internal/holiday"
)

// 启动流程：每个测试自己建一个库，在应用启动之前就把库摆成要的样子。

// nameOn 是库里这一天的节假日名称。
func nameOn(t *testing.T, pool *pgxpool.Pool, date time.Time) string {
	t.Helper()
	day, found, err := holiday.NewStore(pool).Find(t.Context(), date)
	require.NoError(t, err)
	require.True(t, found, "库里没有 %s 这一天", date)
	return day.Name
}

// 数据源在 GitHub 上，偶尔连不上：库里已经有今年的安排就照常启动；
// 连今年的都没有才拒绝启动，免得接口带着空表一直按周末规则回错误答案。
func TestUnreachableSourceBlocksStartupOnlyWithoutThisYearsData(t *testing.T) {
	name := newDatabase(t)
	cfg := baseConfig
	cfg.DatabaseURL = databaseURL(name)
	cfg.HolidaySourceURL = unreachableURL()

	_, err := startApp(cfg)
	require.ErrorContains(t, err, "库里没有今年的节假日安排")

	pool := connect(t, name)
	newYear := time.Date(holiday.Today().Year(), time.January, 1, 0, 0, 0, 0, time.UTC)
	exec(t, pool, "INSERT INTO holiday_days (date, is_off_day, name) VALUES ($1, true, '元旦')", newYear)
	mustStart(t, cfg)
	require.Equal(t, "元旦", nameOn(t, pool, newYear))
}

// 已经部署过的库上是 Rust 版建的表与 sqlx 的迁移登记：数据原样保留，登记删掉。
func TestDatabaseMigratedByTheRustVersionIsTakenOverInPlace(t *testing.T) {
	name := newDatabase(t)
	pool := connect(t, name)
	for _, sql := range []string{
		"CREATE TABLE holiday_days (date date PRIMARY KEY, is_off_day boolean NOT NULL, name text NOT NULL)",
		"CREATE TABLE _sqlx_migrations (version bigint PRIMARY KEY, description text NOT NULL)",
		"INSERT INTO _sqlx_migrations VALUES (1, 'holiday days')",
		"INSERT INTO holiday_days VALUES ('2025-01-01', true, '元旦'), ('2025-01-26', false, '春节')",
	} {
		exec(t, pool, sql)
	}

	// 数据源里只有 2026 年：2025 年的数据只能来自原来的表
	source := newFakeSource()
	t.Cleanup(source.Close)
	cfg := baseConfig
	cfg.DatabaseURL = databaseURL(name)
	cfg.HolidaySourceURL = source.URL
	mustStart(t, cfg)

	require.Equal(t, "春节", nameOn(t, pool, time.Date(2025, time.January, 26, 0, 0, 0, 0, time.UTC)))
	var sqlxLeft bool
	require.NoError(t, pool.QueryRow(t.Context(),
		"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_sqlx_migrations')").Scan(&sqlxLeft))
	require.False(t, sqlxLeft, "sqlx 的迁移登记应当删掉")
}
