//! 节假日安排的数据源：GitHub 上的 holiday-cn 仓库，一年一个 JSON 文件。

use reqwest::{Client, StatusCode};
use serde::Deserialize;

use super::HolidayDay;

/// holiday-cn 仓库里放各年文件的地址
pub const HOLIDAY_CN: &str = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master";

/// 按年拉取节假日安排。
#[derive(Debug, Clone)]
pub struct HolidaySource {
    client: Client,
    base_url: String,
}

#[derive(Debug, thiserror::Error)]
pub enum SourceError {
    #[error("拉取 {year} 年节假日数据失败")]
    Request {
        year: i16,
        #[source]
        source: reqwest::Error,
    },
    #[error("拉取 {year} 年节假日数据失败：HTTP {status}")]
    Status { year: i16, status: StatusCode },
    #[error("{year} 年节假日数据格式不对")]
    Format {
        year: i16,
        #[source]
        source: serde_json::Error,
    },
}

#[derive(Deserialize)]
struct Payload {
    days: Vec<HolidayDay>,
}

impl HolidaySource {
    /// `base_url` 是放各年文件的地址：正式环境是 [`HOLIDAY_CN`]，测试换成本机的假数据源。
    pub fn new(client: Client, base_url: impl Into<String>) -> Self {
        Self {
            client,
            base_url: base_url.into(),
        }
    }

    /// 拉取一整年并校验格式，免得脏数据入库。还没发布时是空列表。
    pub async fn fetch_year(&self, year: i16) -> Result<Vec<HolidayDay>, SourceError> {
        let request_failed = |source| SourceError::Request { year, source };
        let response = self
            .client
            .get(format!("{}/{year}.json", self.base_url))
            .send()
            .await
            .map_err(request_failed)?;
        let status = response.status();
        // 次年的文件要到某个时候才建出来，之前是 404：和「文件有了、安排还没公布」一样，都是还没发布
        if status == StatusCode::NOT_FOUND {
            return Ok(Vec::new());
        }
        if !status.is_success() {
            return Err(SourceError::Status { year, status });
        }
        // 数据源把 .json 文件按 text/plain 返回，不看 Content-Type，直接按 JSON 解
        let body = response.bytes().await.map_err(request_failed)?;
        let payload: Payload =
            serde_json::from_slice(&body).map_err(|source| SourceError::Format { year, source })?;
        Ok(payload.days)
    }
}
