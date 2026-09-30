//! 给 Kubernetes 的探针，只看状态码。
//!
//! 端口在迁移与节假日刷新都做完后才开始监听，所以连得上就说明启动完了，启动期的等待交给 startupProbe。

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use sqlx::PgPool;

use crate::error::ApiError;

pub fn routes() -> Router<PgPool> {
    Router::new()
        // liveness：进程还能处理请求。不碰任何依赖：数据库出故障时重启 Pod 也没用，
        // 所有 Pod 一齐重启、又因为连不上库起不来，只会越重启越糟
        .route("/live", get(|| async { StatusCode::OK }))
        .route("/ready", get(ready))
}

/// readiness：数据库连得上才接流量，节假日查询离不开它。出网的节假日数据源不算在内，
/// 它出故障时换一个 Pod 也一样。不另设超时，由探针自己的 timeoutSeconds 计。
async fn ready(State(pool): State<PgPool>) -> Result<StatusCode, ApiError> {
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(ApiError::DatabaseUnavailable)?;
    Ok(StatusCode::OK)
}
