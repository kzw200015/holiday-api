//! 全部配置都来自环境变量，启动时校验一次，缺了或写错进程直接拒绝启动。清单与默认值见 `.env.example`。

use std::time::Duration;

/// 出网请求默认伪装成一个桌面 Chrome：默认的 UA 容易被当成爬虫拦下。
const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const DEFAULT_OUTBOUND_TIMEOUT: Duration = Duration::from_secs(30);
/// Dockerfile 的 EXPOSE 指向 8000
const DEFAULT_PORT: u16 = 8000;

/// 校验过的配置。
#[derive(Debug, Clone)]
pub struct Config {
    /// PostgreSQL 连接串
    pub database_url: String,
    /// 出网请求（节假日数据源）一律带的 User-Agent
    pub outbound_user_agent: String,
    /// 单次出网请求的超时：等响应头最多这么久，之后按「多久没收到一个字节」算，不限整个响应传多久
    pub outbound_timeout: Duration,
    /// 监听端口
    pub port: u16,
}

/// 配置有误：每一项的问题都列出来，一次改完。
#[derive(Debug, thiserror::Error)]
#[error("环境变量有误：\n{}", .0.join("\n"))]
pub struct ConfigError(Vec<String>);

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    /// 按名字取环境变量的值来校验，空串当作没配。
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let var = |name: &str| lookup(name).filter(|value| !value.is_empty());
        let mut problems = Vec::new();

        let database_url = var("DATABASE_URL");
        if database_url.is_none() {
            problems
                .push("DATABASE_URL: 缺少，形如 postgres://用户:口令@主机:5432/库名".to_owned());
        }
        let outbound_timeout = match var("OUTBOUND_TIMEOUT") {
            None => Some(DEFAULT_OUTBOUND_TIMEOUT),
            Some(text) => parse_duration(&text),
        };
        if outbound_timeout.is_none() {
            problems.push("OUTBOUND_TIMEOUT: 时长要写成整数加单位，如 30s、500ms、5m".to_owned());
        }
        let port = match var("PORT") {
            None => Some(DEFAULT_PORT),
            Some(text) => text.parse().ok().filter(|port| *port != 0),
        };
        if port.is_none() {
            problems.push("PORT: 要是 1–65535 之间的整数".to_owned());
        }

        match (database_url, outbound_timeout, port) {
            (Some(database_url), Some(outbound_timeout), Some(port)) => Ok(Self {
                database_url,
                outbound_user_agent: var("OUTBOUND_USER_AGENT")
                    .unwrap_or_else(|| DEFAULT_USER_AGENT.to_owned()),
                outbound_timeout,
                port,
            }),
            _ => Err(ConfigError(problems)),
        }
    }
}

/// 时长写成 30s、500ms、5m、24h、30d 这样的「整数 + 单位」。
fn parse_duration(text: &str) -> Option<Duration> {
    let (amount, unit) = text.split_at(text.find(|c: char| !c.is_ascii_digit())?);
    let millis_per_unit = match unit {
        "ms" => 1,
        "s" => 1_000,
        "m" => 60_000,
        "h" => 3_600_000,
        "d" => 86_400_000,
        _ => return None,
    };
    amount
        .parse::<u64>()
        .ok()?
        .checked_mul(millis_per_unit)
        .map(Duration::from_millis)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(vars: &[(&str, &str)]) -> Result<Config, ConfigError> {
        Config::from_lookup(|name| {
            vars.iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| (*value).to_owned())
        })
    }

    #[test]
    fn defaults_apply_when_only_database_url_is_set() {
        let config =
            config(&[("DATABASE_URL", "postgres://localhost/myapi")]).expect("配置应当合格");
        assert_eq!(config.outbound_timeout, Duration::from_secs(30));
        assert_eq!(config.outbound_user_agent, DEFAULT_USER_AGENT);
        assert_eq!(config.port, 8000);
    }

    #[test]
    fn durations_are_integer_plus_unit() {
        assert_eq!(parse_duration("500ms"), Some(Duration::from_millis(500)));
        assert_eq!(parse_duration("30s"), Some(Duration::from_secs(30)));
        assert_eq!(parse_duration("5m"), Some(Duration::from_secs(300)));
        assert_eq!(parse_duration("1d"), Some(Duration::from_hours(24)));
        for text in ["30", "s", "1.5s", "-1s", "30 s", "30sec"] {
            assert_eq!(parse_duration(text), None, "{text}");
        }
    }

    #[test]
    fn every_problem_is_listed() {
        let error =
            config(&[("OUTBOUND_TIMEOUT", "30"), ("PORT", "0")]).expect_err("配置应当不合格");
        let message = error.to_string();
        assert!(message.contains("DATABASE_URL: 缺少"), "{message}");
        assert!(
            message.contains("OUTBOUND_TIMEOUT: 时长要写成整数加单位"),
            "{message}"
        );
        assert!(
            message.contains("PORT: 要是 1–65535 之间的整数"),
            "{message}"
        );
    }
}
