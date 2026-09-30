//! 节假日：某一天是不是休息日（术语见 `CONTEXT.md`），以及节假日安排的定期刷新。

pub mod refresh;
mod routes;
pub mod source;
mod store;

use jiff::Timestamp;
use jiff::civil::{Date, Weekday};
use jiff::tz::{self, TimeZone};
pub(crate) use routes::routes;
use serde::Serialize;
use sqlx::PgPool;

/// 节假日安排是中国的：「今天」「今年」一律按北京时间算，不跟着服务器的时区走（容器默认是 UTC）。
static CHINA: TimeZone = tz::get!("Asia/Shanghai");

/// 某一天是不是休息日。节假日安排里的一行也是它，`detail` 接口的响应体也是它。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HolidayDay {
    /// 日期，输出是 YYYY-MM-DD
    #[sqlx(try_from = "jiff_sqlx::Date")]
    pub date: Date,
    /// 是否为休息日
    pub is_off_day: bool,
    /// 节假日名称；为空表示这一天不在节假日安排里（普通工作日或普通周末）
    pub name: String,
}

/// 某一天是不是休息日：节假日安排里有的按安排，没有的按周末判断，此时名称为空。
pub async fn query(pool: &PgPool, date: Date) -> sqlx::Result<HolidayDay> {
    if let Some(day) = store::find(pool, date).await? {
        return Ok(day);
    }
    let weekend = matches!(date.weekday(), Weekday::Saturday | Weekday::Sunday);
    Ok(HolidayDay {
        date,
        is_off_day: weekend,
        name: String::new(),
    })
}

/// 某一时刻在北京是哪一天。
pub fn china_date(at: Timestamp) -> Date {
    CHINA.to_datetime(at).date()
}

/// 北京时间的今天。
pub fn china_today() -> Date {
    china_date(Timestamp::now())
}

#[cfg(test)]
mod tests {
    use jiff::civil::date;

    use super::*;

    #[test]
    fn today_follows_china_time() {
        // UTC 的 1 月 3 日 16:30 在北京已经是 1 月 4 日
        let at: Timestamp = "2026-01-03T16:30:00Z".parse().expect("时刻应当合法");
        assert_eq!(china_date(at), date(2026, 1, 4));
    }
}
