//! 出网：本进程访问外部网站（节假日数据源）一律经这里建出的客户端。

use std::time::Duration;

use reqwest::ClientBuilder;
use reqwest::redirect::Policy;

/// 连不上时多久放弃；已经连上的慢响应不受它限制
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// 出网客户端的配置：所有请求共用同一个 User-Agent 与超时。调用方 `build()` 出客户端，测试还要再绕开开发机上配的代理。
///
/// 超时按「多久没收到一个字节」算：等响应头最多 `timeout`，之后两次数据之间也各最多 `timeout`，
/// 不限整个响应传多久，慢慢传着的大响应不会传到一半被掐断。
///
/// 不跟随重定向，调用方自己看 3xx（数据源不该重定向，按失败处理）：跟随的话，外部网站就能把请求引到别处，包括内网。
/// 代理照 `HTTPS_PROXY`、`NO_PROXY` 这些环境变量走。
pub fn builder(user_agent: &str, timeout: Duration) -> ClientBuilder {
    reqwest::Client::builder()
        .user_agent(user_agent)
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(timeout)
        .redirect(Policy::none())
}
