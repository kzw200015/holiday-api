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

const DATE_RULE: &str = "日期格式错误，应为 YYYY-MM-DD";

/// 这两条是公开接口，有外部调用方：路径与响应体就是对外的契约，改之前想清楚。
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
    let date = requested_date(&params)?;
    Ok(Json(query(&pool, date).await?.is_off_day))
}

async fn detail(
    State(pool): State<PgPool>,
    AppQuery(params): AppQuery<DateParams>,
) -> Result<Json<HolidayDay>, ApiError> {
    let date = requested_date(&params)?;
    Ok(Json(query(&pool, date).await?))
}

/// 两条接口共用的查询参数。
#[derive(Deserialize)]
struct DateParams {
    date: Option<String>,
}

/// 要查的是哪一天：`date` 省略或空串表示北京时间的今天，否则按 jiff 的 ISO 8601 规则解析，且这一天须真实存在。
fn requested_date(params: &DateParams) -> Result<Date, ApiError> {
    match params.date.as_deref() {
        None | Some("") => Ok(china_date(Timestamp::now())),
        Some(text) => text
            .parse()
            .map_err(|_| ApiError::BadRequest(vec![DATE_RULE.to_owned()])),
    }
}
