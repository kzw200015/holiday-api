use axum::Router;
use sqlx::PgPool;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::error::ApiError;
use crate::{health, holiday};

/// 整个应用：接口一律挂在 /api 下，各领域的路由只写领域内的路径。
///
/// 所有失败都回成 `{statusCode, message, error}`，包括写错的路径（404）与路径对、方法不对的请求
/// （405，照常带上 `Allow` 头）。每个请求结束时记一行方法、路径、状态码与耗时。
pub fn router(pool: PgPool) -> Router {
    Router::new()
        .nest("/api/holiday", holiday::routes())
        .nest("/api/health", health::routes())
        .fallback(async || ApiError::NotFound)
        .method_not_allowed_fallback(async || ApiError::MethodNotAllowed)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(pool)
}
