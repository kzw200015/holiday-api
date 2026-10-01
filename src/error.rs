use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// 回给调用方的失败，一律回成 `{statusCode, message, error}`。
///
/// 每个变体的 `Display` 就是给调用方看的 `message`：中文，不放上游原话、地址这类细节
/// （入参解析不了时例外，见 `extract.rs`）。5xx 带着的原因只在 [`IntoResponse`] 里记进日志。
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    /// 入参不合格：状态码是 4xx，文案照提取器给的
    #[error("{message}")]
    Rejected { status: StatusCode, message: String },
    #[error("这个地址不存在")]
    NotFound,
    #[error("不支持这个请求方法")]
    MethodNotAllowed,
    /// 数据库连不上
    #[error("数据库连不上")]
    DatabaseUnavailable(sqlx::Error),
    /// 未预料的异常：数据库出错、处理请求时 panic 等
    #[error("服务器出错了")]
    Internal(anyhow::Error),
}

/// 处理函数里查库用 `?` 即可：没料到的数据库错误都算内部异常。
impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        Self::Internal(error.into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    status_code: u16,
    message: String,
    /// 状态码的标准短语，如 Bad Request
    error: &'static str,
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            Self::Rejected { status, .. } => *status,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED,
            Self::DatabaseUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// 5xx 的原因记进日志；4xx 是调用方的问题，请求日志里的状态码就够了。
    /// 逐个列出变体：加了新变体，编译器会要求在这里决定记不记。
    fn log(&self) {
        match self {
            Self::DatabaseUnavailable(error) => tracing::warn!("数据库连不上：{error}"),
            Self::Internal(error) => tracing::error!("未预料的异常：{error:#}"),
            Self::Rejected { .. } | Self::NotFound | Self::MethodNotAllowed => {}
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        self.log();
        let status = self.status();
        let body = ErrorBody {
            status_code: status.as_u16(),
            message: self.to_string(),
            error: status.canonical_reason().unwrap_or_default(),
        };
        (status, Json(body)).into_response()
    }
}
