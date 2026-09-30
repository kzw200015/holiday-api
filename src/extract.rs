//! 统一失败响应的提取器：包住 axum 自带的提取器，解析失败时回 [`ApiError`]，而不是 axum 默认的纯文本。

use axum::extract::{FromRequestParts, Query};
use axum::http::request::Parts;
use serde::de::DeserializeOwned;

use crate::error::ApiError;

/// 查询参数，按 `T` 的字段反序列化，字段可以直接是领域类型（如 `Option<Date>`）。
/// 解析不了（参数重复、值的格式不对等）回 400。
///
/// 失败时的文案原样用 axum 给的英文原话，是「`message` 用中文」这条约定的例外。
pub struct AppQuery<T>(pub T);

impl<S, T> FromRequestParts<S> for AppQuery<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Query(value) = Query::<T>::from_request_parts(parts, state)
            .await
            .map_err(|rejection| ApiError::BadRequest(vec![rejection.body_text()]))?;
        Ok(Self(value))
    }
}
