//! 节假日安排的刷新：启动时一次，之后每天北京时间 4:30 一次。

use std::time::Duration;

use anyhow::Context;
use jiff::Timestamp;
use jiff::civil::Time;
use sqlx::PgPool;
use tokio::task::JoinSet;

use super::source::HolidaySource;
use super::{CHINA, china_date, store};

/// 每日刷新的时刻（北京时间）：数据源一年只更新几次（次年安排公布、临时调休），每天拉一次足够。
const DAILY_AT: Time = Time::constant(4, 30, 0, 0);

/// 启动时拉当年和次年，在开始监听端口之前调用。
///
/// 库里已经有今年的安排就放到后台去拉（任务放进 `background`，关停时随之取消），不拖慢启动，拉不到只记日志——
/// 数据源在 GitHub 上，偶尔又慢又连不上，不该因此起不来。连今年的都没有才等它拉完，拉不到就拒绝启动，
/// 免得接口带着空表一直按周末规则回错误答案。
pub async fn on_startup(
    pool: &PgPool,
    source: &HolidaySource,
    background: &mut JoinSet<()>,
) -> anyhow::Result<()> {
    let year = china_date(Timestamp::now()).year();
    if !store::has_year(pool, year).await? {
        return upcoming_years(pool, source).await;
    }
    let (pool, source) = (pool.clone(), source.clone());
    background.spawn(async move {
        if let Err(error) = upcoming_years(&pool, &source).await {
            tracing::error!("启动时刷新节假日数据失败，先用库里已有的数据：{error:#}");
        }
    });
    Ok(())
}

/// 每天北京时间 4:30 刷新一次，一直跑到任务被取消。
///
/// 失败只记日志，第二天再试；一次跑完才算下一次，不会叠着跑。
pub async fn daily(pool: PgPool, source: HolidaySource) {
    loop {
        let now = Timestamp::now();
        let wait = next_run_after(now)
            .and_then(|next| Duration::try_from(next.duration_since(now)))
            .context("算下一次刷新的时刻失败");
        match wait {
            Ok(wait) => tokio::time::sleep(wait).await,
            Err(error) => {
                tracing::error!("{error:#}，每日刷新就此停止");
                return;
            }
        }
        if let Err(error) = upcoming_years(&pool, &source).await {
            tracing::error!("定时刷新节假日数据失败：{error:#}");
        }
    }
}

/// 刷新当年和次年。年份每次重新算，跨年后自然带上新的次年；两年互不依赖所以并行，任一失败即整体失败。
pub async fn upcoming_years(pool: &PgPool, source: &HolidaySource) -> anyhow::Result<()> {
    let year = china_date(Timestamp::now()).year();
    tokio::try_join!(
        one_year(pool, source, year),
        one_year(pool, source, year + 1)
    )?;
    Ok(())
}

/// 刷新一整年。
pub async fn one_year(pool: &PgPool, source: &HolidaySource, year: i16) -> anyhow::Result<()> {
    // 拉取放在事务外，免得一次慢请求白占着数据库连接
    let days = source.fetch_year(year).await?;
    // 拉到空的就不动库：一年的安排公布之后不会变回没有，拉到空的只能是还没发布，
    // 或者数据源出了岔子（路径变了、全回 404），这时先删后插只会把已有的安排清掉
    if days.is_empty() {
        tracing::info!("{year} 年的节假日安排还没有发布");
        return Ok(());
    }
    store::replace_year(pool, year, &days)
        .await
        .with_context(|| format!("写入 {year} 年节假日数据失败"))?;
    tracing::info!("已刷新 {year} 年的节假日数据，共 {} 天", days.len());
    Ok(())
}

/// `now` 之后的下一个北京时间 4:30。
fn next_run_after(now: Timestamp) -> Result<Timestamp, jiff::Error> {
    let today = china_date(now);
    let at = CHINA.to_timestamp(today.to_datetime(DAILY_AT))?;
    if at > now {
        return Ok(at);
    }
    CHINA.to_timestamp(today.tomorrow()?.to_datetime(DAILY_AT))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> Timestamp {
        text.parse().expect("时刻应当合法")
    }

    #[test]
    fn next_run_is_4_30_in_china() -> Result<(), jiff::Error> {
        // 北京时间 1 月 4 日 00:30，当天的 4:30 还没到
        assert_eq!(
            next_run_after(at("2026-01-03T16:30:00Z"))?,
            at("2026-01-03T20:30:00Z")
        );
        // 正好 4:30 与之后，都排到第二天
        assert_eq!(
            next_run_after(at("2026-01-03T20:30:00Z"))?,
            at("2026-01-04T20:30:00Z")
        );
        assert_eq!(
            next_run_after(at("2026-01-04T02:00:00Z"))?,
            at("2026-01-04T20:30:00Z")
        );
        Ok(())
    }
}
