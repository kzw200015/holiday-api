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

-- 阅读历史与进度共用一张表；时间相同时用 gid 保证分页顺序稳定。
-- name: ListReadingHistory :many
SELECT gid, token, page, updated_at FROM eh_reading_progress
WHERE user_id = @user_id
  AND (NOT @has_cursor::boolean OR (updated_at, gid) < (@before_at::timestamptz, @before_gid::bigint))
ORDER BY updated_at DESC, gid DESC
LIMIT @page_limit;

-- name: DeleteReadingProgress :exec
DELETE FROM eh_reading_progress WHERE user_id = $1 AND gid = $2;

-- name: ClearReadingProgress :exec
DELETE FROM eh_reading_progress WHERE user_id = $1;

-- name: GetEhPreferences :one
SELECT categories, reader_interval FROM eh_preferences WHERE user_id = $1;

-- 整份覆盖前端推上来的那一份，不在这里算增量。
-- name: SaveEhPreferences :exec
INSERT INTO eh_preferences (user_id, categories, reader_interval, created_at, updated_at)
VALUES (@user_id, @categories, @reader_interval, now(), now())
ON CONFLICT (user_id) DO UPDATE
SET categories = excluded.categories, reader_interval = excluded.reader_interval, updated_at = now();

-- name: GetEhSearchHistory :one
SELECT search_history FROM eh_preferences WHERE user_id = $1;

-- 同样整份覆盖；顺序、去重、留几条都是前端定好的。
-- name: SaveEhSearchHistory :exec
INSERT INTO eh_preferences (user_id, search_history, created_at, updated_at)
VALUES (@user_id, @search_history, now(), now())
ON CONFLICT (user_id) DO UPDATE
SET search_history = excluded.search_history, updated_at = now();
