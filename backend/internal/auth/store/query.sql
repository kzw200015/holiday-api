-- name: CreateUser :one
INSERT INTO users (username, password_hash, created_at, updated_at)
VALUES ($1, $2, now(), now())
RETURNING *;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;
