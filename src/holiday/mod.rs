//! 节假日：某一天是不是休息日（术语见 `CONTEXT.md`），以及节假日安排的定期刷新。

pub mod refresh;
mod routes;
pub mod source;
mod store;

use jiff::Timestamp;
use jiff::civil::{Date, Weekday};
use jiff::tz::{self, TimeZone};
pub(crate) use routes::routes;
use serde::{Deserialize, Deserializer, Serialize};
use sqlx::PgPool;

/// 节假日安排是中国的：「今天」「今年」一律按北京时间算，不跟着服务器的时区走（容器默认是 UTC）。
static CHINA: TimeZone = tz::get!("Asia/Shanghai");

/// 某一天是不是休息日。节假日安排里的一行也是它。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HolidayDay {
    /// 日期，进出都是 YYYY-MM-DD
    #[serde(deserialize_with = "calendar_date")]
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

/// 严格的日历日期：格式是 YYYY-MM-DD，且这一天真实存在（2026-02-30 不算）。查询参数与数据源都按它认日期。
fn parse_calendar_date(text: &str) -> Option<Date> {
    // jiff 还认 20260101、+002026-01-01 这类写法，先按字形挡掉
    let shaped = text.len() == 10
        && text.bytes().enumerate().all(|(index, byte)| match index {
            4 | 7 => byte == b'-',
            _ => byte.is_ascii_digit(),
        });
    if shaped { text.parse().ok() } else { None }
}

// TODO: 要解析的数据多了，或想让类型不对时直说「期望 YYYY-MM-DD」，改成自己的 Visitor 调 deserialize_str，省掉这次 String 分配
fn calendar_date<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Date, D::Error> {
    let text = String::deserialize(deserializer)?;
    parse_calendar_date(&text)
        .ok_or_else(|| serde::de::Error::custom(format!("不是 YYYY-MM-DD 格式的日期：{text}")))
}

#[cfg(test)]
mod tests {
    use jiff::civil::date;

    use super::*;

    #[test]
    fn calendar_dates_are_strict() {
        assert_eq!(parse_calendar_date("2026-01-04"), Some(date(2026, 1, 4)));
        assert_eq!(parse_calendar_date("2024-02-29"), Some(date(2024, 2, 29)));
        for text in [
            "",
            "invalid",
            "2026-02-30",
            "2025-02-29",
            "2026-1-4",
            "2026-13-01",
            "20260101",
            "+02026-01-01",
        ] {
            assert_eq!(parse_calendar_date(text), None, "{text}");
        }
    }

    #[test]
    fn today_follows_china_time() {
        // UTC 的 1 月 3 日 16:30 在北京已经是 1 月 4 日
        let at: Timestamp = "2026-01-03T16:30:00Z".parse().expect("时刻应当合法");
        assert_eq!(china_date(at), date(2026, 1, 4));
    }
}
