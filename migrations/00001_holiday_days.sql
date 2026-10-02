-- 节假日安排：一天一行。
--
-- 已经部署过的库上，这张表是 Rust 版建的，形状相同：IF NOT EXISTS 原样接管，数据不动。
-- Rust 版 sqlx 的迁移登记换成 goose 之后用不上，删掉。

-- +goose Up
CREATE TABLE IF NOT EXISTS holiday_days (
  date date PRIMARY KEY,
  is_off_day boolean NOT NULL,
  name text NOT NULL
);

DROP TABLE IF EXISTS _sqlx_migrations;
