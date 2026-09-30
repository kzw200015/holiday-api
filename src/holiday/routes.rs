use axum::extract::{FromRequestParts, Query, State};
use axum::http::request::Parts;
use axum::routing::get;
use axum::{Json, Router};
use jiff::Timestamp;
use jiff::civil::Date;
use serde::Deserialize;
use sqlx::PgPool;

use super::{HolidayDay, china_date, parse_calendar_date, query};
use crate::error::ApiError;

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
    RequestedDate(date): RequestedDate,
) -> Result<Json<bool>, ApiError> {
    Ok(Json(query(&pool, date).await?.is_off_day))
}

async fn detail(
    State(pool): State<PgPool>,
    RequestedDate(date): RequestedDate,
) -> Result<Json<HolidayDay>, ApiError> {
    Ok(Json(query(&pool, date).await?))
}

/// 两条接口共用的查询参数 `date`：省略或空串表示北京时间的今天。
struct RequestedDate(Date);

#[derive(Deserialize)]
struct DateParams {
    date: Option<String>,
}

// TODO: 出现第二个要读查询参数的接口时，抽出通用的查询参数提取器（失败统一回 ApiError），这里改为建在它上面；
// 这类提取器多了，可改用 axum 的 #[derive(FromRequestParts)] 或 axum-extra 的 WithRejection 少写样板
impl<S: Send + Sync> FromRequestParts<S> for RequestedDate {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let bad_date = || ApiError::BadRequest(vec![DATE_RULE.to_owned()]);
        let Query(params) = Query::<DateParams>::from_request_parts(parts, state)
            .await
            .map_err(|_| bad_date())?;
        match params.date.as_deref() {
            None | Some("") => Ok(Self(china_date(Timestamp::now()))),
            Some(text) => parse_calendar_date(text).map(Self).ok_or_else(bad_date),
        }
    }
}
