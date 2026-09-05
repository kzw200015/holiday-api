-- name: CreateUser :one
INSERT INTO users (username, password_hash, created_at, updated_at)
VALUES ($1, $2, now(), now())
RETURNING *;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetHolidayDayByDate :one
SELECT name, date, is_off_day FROM holiday_days WHERE date = $1;

-- name: DeleteHolidayDaysByYearPrefix :exec
DELETE FROM holiday_days WHERE date LIKE $1;

-- 单条语句插入整年的数据。三个 unnest 并排展开，比拼多行 VALUES 省事，
-- 而且空数组自然插 0 行——2027 年安排还没发布时远程返回的就是空列表。
-- name: InsertHolidayDays :exec
INSERT INTO holiday_days (name, date, is_off_day, created_at, updated_at)
SELECT unnest(@names::text[]), unnest(@dates::text[]), unnest(@is_off_days::boolean[]), now(), now();

-- name: GetEhCredential :one
SELECT member_id, cookie, has_ex_access FROM eh_credentials WHERE user_id = $1;

-- name: UpsertEhCredential :exec
INSERT INTO eh_credentials (user_id, member_id, cookie, has_ex_access, created_at, updated_at)
VALUES ($1, $2, $3, $4, now(), now())
ON CONFLICT (user_id) DO UPDATE
SET member_id = excluded.member_id,
    cookie = excluded.cookie,
    has_ex_access = excluded.has_ex_access,
    updated_at = now();

-- name: DeleteEhCredential :exec
DELETE FROM eh_credentials WHERE user_id = $1;

-- name: GetReadingProgress :one
SELECT page FROM eh_reading_progress WHERE user_id = $1 AND gid = $2;

-- name: UpsertReadingProgress :exec
INSERT INTO eh_reading_progress (user_id, gid, token, page, created_at, updated_at)
VALUES ($1, $2, $3, $4, now(), now())
ON CONFLICT (user_id, gid) DO UPDATE
SET token = excluded.token,
    page = excluded.page,
    updated_at = now();
