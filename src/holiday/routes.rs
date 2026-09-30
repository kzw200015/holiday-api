use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use jiff::Timestamp;
use jiff::civil::Date;
use serde::Deserialize;
use sqlx::PgPool;

use super::{HolidayDay, china_date, query};
use crate::error::ApiError;
use crate::extract::AppQuery;

/// 调用方是自己的其他程序：路径与成功时的响应体改了，要同步改调用方。
pub fn routes() -> Router<PgPool> {
    Router::new()
        // 只回这天是不是休息日，响应体就是一个 JSON 布尔值
        .route("/is-holiday", get(is_holiday))
        // 是不是休息日，外加对应的节假日名称
        .route("/detail", get(detail))
}

async fn is_holiday(
    State(pool): State<PgPool>,
    AppQuery(params): AppQuery<DateParams>,
) -> Result<Json<bool>, ApiError> {
    Ok(Json(query(&pool, params.date_or_today()).await?.is_off_day))
}

async fn detail(
    State(pool): State<PgPool>,
    AppQuery(params): AppQuery<DateParams>,
) -> Result<Json<HolidayDay>, ApiError> {
    Ok(Json(query(&pool, params.date_or_today()).await?))
}

/// 两条接口共用的查询参数。
#[derive(Deserialize)]
struct DateParams {
    /// 按 jiff 的 ISO 8601 规则解析，这一天须真实存在；空串也算写错
    date: Option<Date>,
}

impl DateParams {
    /// 要查的是哪一天：省略 `date` 表示北京时间的今天。
    fn date_or_today(&self) -> Date {
        self.date.unwrap_or_else(|| china_date(Timestamp::now()))
    }
}
