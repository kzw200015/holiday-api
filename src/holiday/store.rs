//! 节假日安排在库里的读写：`holiday_days` 一天一行。

// TODO: SQL 多了、复杂了，集成测试兜着越来越费劲时，改用 sqlx::query! 宏在编译期对照库检查
// （要装 sqlx-cli 并提交 .sqlx/ 离线缓存）；这推翻 ADR-0001 的取舍，改之前先更新 ADR

use jiff::civil::Date;
use jiff_sqlx::ToSqlx;
use sqlx::PgPool;

use super::HolidayDay;

/// 节假日安排里这一天的那一行。
pub async fn find(pool: &PgPool, date: Date) -> sqlx::Result<Option<HolidayDay>> {
    sqlx::query_as("SELECT date, is_off_day, name FROM holiday_days WHERE date = $1")
        .bind(date.to_sqlx())
        .fetch_optional(pool)
        .await
}

/// 库里有没有这一年的安排。
pub async fn has_year(pool: &PgPool, year: i16) -> sqlx::Result<bool> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM holiday_days WHERE EXTRACT(YEAR FROM date) = $1)",
    )
    .bind(i32::from(year))
    .fetch_one(pool)
    .await
}

/// 以「先删后插」替换一整年。删和插在一个事务里：中途出错即回滚，不会留下「旧的没了、新的也没进来」的空年份。
pub async fn replace_year(pool: &PgPool, year: i16, days: &[HolidayDay]) -> sqlx::Result<()> {
    let mut transaction = pool.begin().await?;
    sqlx::query("DELETE FROM holiday_days WHERE EXTRACT(YEAR FROM date) = $1")
        .bind(i32::from(year))
        .execute(&mut *transaction)
        .await?;
    sqlx::query(
        "INSERT INTO holiday_days (date, is_off_day, name) \
         SELECT * FROM UNNEST($1::date[], $2::boolean[], $3::text[])",
    )
    .bind(
        days.iter()
            .map(|day| day.date.to_sqlx())
            .collect::<Vec<_>>(),
    )
    .bind(days.iter().map(|day| day.is_off_day).collect::<Vec<_>>())
    .bind(days.iter().map(|day| day.name.as_str()).collect::<Vec<_>>())
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await
}
