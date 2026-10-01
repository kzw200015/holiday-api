//! 统一失败响应的提取器：包住 axum 自带的提取器，解析失败时回 [`ApiError`]，而不是 axum 默认的纯文本。
//!
//! 失败时状态码照 axum 的（多是 400，JSON 请求体还有 413、415、422），文案原样用 axum 给的英文原话，
//! 是「`message` 用中文」这条约定的例外。axum 回 5xx 的是路由与提取器对不上，属于自己写错，当内部异常。

use axum::Json;
use axum::extract::{FromRequest, FromRequestParts, Path, Query, Request};
use axum::http::StatusCode;
use axum::http::request::Parts;
use serde::de::DeserializeOwned;

use crate::error::ApiError;

/// 查询参数，按 `T` 的字段反序列化，字段可以直接是领域类型（如 `Option<Date>`）。
/// 解析不了（参数重复、值的格式不对等）回 400。
pub struct AppQuery<T>(pub T);

/// 路径参数，如 `/items/{id}` 的 `id`：只有一个时 `T` 直接是它的类型，几个时用元组或结构体。
/// 解析不了回 400。
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "还没有接口用到；第一个用上它的接口一加，编译器就会提醒删掉这行"
    )
)]
pub struct AppPath<T>(pub T);

/// JSON 请求体，按 `T` 反序列化；响应照旧用 axum 的 `Json`。
///
/// 要求 `Content-Type: application/json`，否则回 415；JSON 语法不对回 400，字段缺了或类型不对回 422，
/// 超过 axum 默认的 2 MB 回 413。
#[expect(
    dead_code,
    reason = "还没有接口用到；第一个用上它的接口一加，编译器就会提醒删掉这行"
)]
pub struct AppJson<T>(pub T);

impl<S, T> FromRequestParts<S> for AppQuery<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Query(value) = Query::<T>::from_request_parts(parts, state)
            .await
            .map_err(|rejection| rejected(rejection.status(), rejection.body_text()))?;
        Ok(Self(value))
    }
}

impl<S, T> FromRequestParts<S> for AppPath<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Send,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Path(value) = Path::<T>::from_request_parts(parts, state)
            .await
            .map_err(|rejection| rejected(rejection.status(), rejection.body_text()))?;
        Ok(Self(value))
    }
}

impl<S, T> FromRequest<S> for AppJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(request, state)
            .await
            .map_err(|rejection| rejected(rejection.status(), rejection.body_text()))?;
        Ok(Self(value))
    }
}

/// axum 的拒绝转成 [`ApiError`]：4xx 是调用方的问题，带着 axum 的状态码与原话回去；
/// 5xx 是路由与提取器对不上（比如路由里没有路径参数却用了 `AppPath`），当内部异常。
fn rejected(status: StatusCode, text: String) -> ApiError {
    if status.is_server_error() {
        ApiError::Internal(anyhow::anyhow!("提取入参失败：{text}"))
    } else {
        ApiError::Rejected {
            status,
            message: text,
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::body::{Body, to_bytes};
    use axum::http::{self, StatusCode};
    use axum::routing::get;
    use axum::{Json, Router};
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use super::AppPath;

    async fn get_path(app: Router, uri: &str) -> (StatusCode, Value) {
        let request = http::Request::get(uri)
            .body(Body::empty())
            .expect("请求应当建得出来");
        let response = app.oneshot(request).await.expect("路由本身不会失败");
        let status = response.status();
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("响应体应当读得完");
        let body = serde_json::from_slice(&body).expect("响应体应当是 JSON");
        (status, body)
    }

    async fn item(AppPath(id): AppPath<u32>) -> Json<u32> {
        Json(id)
    }

    #[tokio::test]
    async fn path_extractor_on_a_route_without_params_is_a_500() {
        let app = Router::new().route("/items", get(item));
        assert_eq!(
            get_path(app, "/items").await,
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({"statusCode": 500, "message": "服务器出错了", "error": "Internal Server Error"})
            )
        );
    }
}
