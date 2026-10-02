-- name: FindDay :one
-- 节假日安排里这一天的那一行。
SELECT date, is_off_day, name FROM holiday_days WHERE date = $1;

-- name: HasYear :one
-- 库里有没有这一年的安排。按年份写成日期范围，走得上 date 主键的索引。
SELECT EXISTS (
  SELECT 1 FROM holiday_days
  WHERE date >= make_date(sqlc.arg(year)::int, 1, 1) AND date < make_date(sqlc.arg(year)::int + 1, 1, 1)
);

-- name: DeleteYear :exec
DELETE FROM holiday_days
WHERE date >= make_date(sqlc.arg(year)::int, 1, 1) AND date < make_date(sqlc.arg(year)::int + 1, 1, 1);

-- name: InsertDays :copyfrom
INSERT INTO holiday_days (date, is_off_day, name) VALUES ($1, $2, $3);
