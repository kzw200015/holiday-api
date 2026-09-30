//! 统一失败响应的提取器：包住 axum 自带的提取器，解析失败时回 [`ApiError`]，而不是 axum 默认的纯文本。

use axum::extract::{FromRequestParts, Query};
use axum::http::request::Parts;
use serde::de::DeserializeOwned;

use crate::error::ApiError;

const QUERY_RULE: &str = "查询参数格式错误";

/// 查询参数，按 `T` 的字段反序列化。格式不对（如同一个参数传了两次）回 400。
///
/// 这一步只管把查询串拆成字段，字段里的值合不合业务的规矩由各接口自己再查。
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
            .map_err(|_| ApiError::BadRequest(vec![QUERY_RULE.to_owned()]))?;
        Ok(Self(value))
    }
}
