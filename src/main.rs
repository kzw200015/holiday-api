use std::io::IsTerminal;
use std::net::{Ipv4Addr, SocketAddr};

use anyhow::Context;
use myapi::config::Config;
use myapi::holiday::source::{HOLIDAY_CN, HolidaySource};
use myapi::{outbound, server};
use sqlx::postgres::PgPoolOptions;
use tokio::signal::unix::{SignalKind, signal};
use tracing_subscriber::EnvFilter;

/// 没配 `RUST_LOG` 时的日志级别：迁移时 PostgreSQL 回的 notice（「已经存在，跳过」这类）不记
const DEFAULT_LOG_FILTER: &str = "info,sqlx::postgres::notice=warn";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 本地开发读当前目录的 .env（已被 Git 忽略）；容器里没有这个文件，全用环境变量
    if let Err(error) = dotenvy::dotenv()
        && !error.not_found()
    {
        return Err(error).context("读取 .env 失败");
    }
    // 容器里由日志收集器读标准输出，只有在终端里才上色
    tracing_subscriber::fmt()
        .with_ansi(std::io::stdout().is_terminal())
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(DEFAULT_LOG_FILTER)),
        )
        .init();

    let config = Config::from_env()?;
    // 建出来时不连，第一次用到才连；开始接请求之前，启动流程先经它把迁移跑完
    let pool = PgPoolOptions::new().connect_lazy(&config.database_url)?;
    let client = outbound::builder(&config.outbound_user_agent, config.outbound_timeout).build()?;
    let source = HolidaySource::new(client, HOLIDAY_CN);

    let addr = SocketAddr::from((Ipv4Addr::UNSPECIFIED, config.port));
    let server = server::start(addr, pool.clone(), source).await?;
    tracing::info!("已开始监听 {} 端口", config.port);

    let signal = shutdown_signal().await?;
    tracing::info!("收到 {signal}，正在关停");
    server.shutdown().await?;
    pool.close().await;
    Ok(())
}

/// 等到该关停的时候：容器停止时收到 SIGTERM，本地按 Ctrl+C 是 SIGINT。
async fn shutdown_signal() -> std::io::Result<&'static str> {
    let mut terminate = signal(SignalKind::terminate())?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    Ok(tokio::select! {
        _ = terminate.recv() => "SIGTERM",
        _ = interrupt.recv() => "SIGINT",
    })
}
