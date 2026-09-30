use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// 回给调用方的失败，一律回成 `{statusCode, message, error}`。
///
/// `message` 是给调用方看的中文，不放上游原话、地址这类细节；未预料的异常原文只进日志。
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    /// 入参不合格，带一组去重的文案
    // TODO: 400 多到在性能分析里看得见时，改成 Vec<Cow<'static, str>>，固定文案不必再 to_owned
    #[error("{}", .0.join("；"))]
    BadRequest(Vec<String>),
    #[error("这个地址不存在")]
    NotFound,
    #[error("不支持这个请求方法")]
    MethodNotAllowed,
    #[error("{0}")]
    ServiceUnavailable(&'static str),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    status_code: u16,
    message: Message,
    /// 状态码的标准短语，如 Bad Request
    error: &'static str,
}

/// 入参不合格时是一组文案，其余是一句话。
#[derive(Serialize)]
#[serde(untagged)]
enum Message {
    One(String),
    Many(Vec<String>),
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED,
            Self::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let message = match self {
            Self::BadRequest(messages) => Message::Many(messages),
            Self::Database(error) => {
                tracing::error!("未预料的异常：{error}");
                Message::One("服务器出错了".to_owned())
            }
            other => Message::One(other.to_string()),
        };
        let body = ErrorBody {
            status_code: status.as_u16(),
            message,
            error: status.canonical_reason().unwrap_or_default(),
        };
        (status, Json(body)).into_response()
    }
}
