-- name: GetHolidayDayByDate :one
SELECT name, date, is_off_day FROM holiday_days WHERE date = $1;

-- name: DeleteHolidayDaysByYearPrefix :exec
DELETE FROM holiday_days WHERE date LIKE $1;

-- 单条语句插入整年的数据。三个 unnest 并排展开，比拼多行 VALUES 省事，
-- 而且空数组自然插 0 行——2027 年安排还没发布时远程返回的就是空列表。
-- name: InsertHolidayDays :exec
INSERT INTO holiday_days (name, date, is_off_day, created_at, updated_at)
SELECT unnest(@names::text[]), unnest(@dates::text[]), unnest(@is_off_days::boolean[]), now(), now();
