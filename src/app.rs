use std::any::Any;

use axum::Router;
use axum::response::{IntoResponse, Response};
use sqlx::PgPool;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::error::ApiError;
use crate::{health, holiday};

/// 整个应用：接口一律挂在 /api 下，各领域的路由只写领域内的路径。
///
/// 所有失败都回成 `{statusCode, message, error}`，包括写错的路径（404）、路径对但方法不对的请求
/// （405，照常带上 `Allow` 头）与处理请求时的 panic（500）。每个请求结束时记一行方法、路径、状态码与耗时。
pub fn router(pool: PgPool) -> Router {
    Router::new()
        .nest("/api/holiday", holiday::routes())
        .nest("/api/health", health::routes())
        // TODO: 用上 extract.rs 没包的 axum 提取器（Form、Multipart 等）时，要么照样包一层，要么加一层中间件兜底：
        // 把漏网的 axum 纯文本 4xx 改写成统一的失败体
        .fallback(async || ApiError::NotFound)
        .method_not_allowed_fallback(async || ApiError::MethodNotAllowed)
        // 在请求日志的里层：panic 转成的 500 照常记进请求日志
        .layer(CatchPanicLayer::custom(on_panic))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(pool)
}

/// 处理请求时 panic：带上 panic 的内容回统一的 500 失败体，而不是直接断开连接。
#[expect(
    clippy::needless_pass_by_value,
    reason = "签名由 CatchPanicLayer 规定，只能按值收下 panic 的内容"
)]
fn on_panic(panic: Box<dyn Any + Send + 'static>) -> Response {
    let detail = panic
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| panic.downcast_ref::<&str>().copied())
        .unwrap_or("（panic 的内容不是字符串）");
    ApiError::Internal(anyhow::anyhow!("处理请求时 panic：{detail}")).into_response()
}

#[cfg(test)]
mod tests {
    use axum::body::{Body, to_bytes};
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use super::*;

    async fn boom() -> &'static str {
        panic!("测试用的 panic")
    }

    #[tokio::test]
    async fn panics_become_the_json_500() {
        let app = Router::new()
            .route("/boom", get(boom))
            .layer(CatchPanicLayer::custom(on_panic));
        let request = Request::get("/boom")
            .body(Body::empty())
            .expect("请求应当建得出来");
        let response = app.oneshot(request).await.expect("路由本身不会失败");
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("响应体应当读得完");
        let body: Value = serde_json::from_slice(&body).expect("响应体应当是 JSON");
        assert_eq!(
            body,
            json!({"statusCode": 500, "message": "服务器出错了", "error": "Internal Server Error"})
        );
    }
}
