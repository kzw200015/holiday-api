use axum::http::StatusCode;
use axum::http::header::CONTENT_TYPE;
use axum::response::IntoResponse;
use jiff::Timestamp;
use myapi::holiday::{china_date, refresh};
use serde_json::{Value, json};

use crate::support::{TestApp, holiday_cn, plain_json};

async fn detail(app: &TestApp, date: &str) -> Value {
    let reply = app.get(&format!("/api/holiday/detail?date={date}")).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    reply.json()
}

#[tokio::test]
async fn is_holiday_answers_a_bare_json_boolean() {
    let app = TestApp::start().await;
    // 2026-01-04 是调休上班的周日，2026-01-10 是普通周六，2026-01-07 是普通周三
    for (date, expected) in [
        ("2026-01-04", false),
        ("2026-01-10", true),
        ("2026-01-07", false),
    ] {
        let reply = app
            .get(&format!("/api/holiday/is-holiday?date={date}"))
            .await;
        assert_eq!(reply.status, StatusCode::OK);
        let content_type = reply
            .headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok());
        assert_eq!(content_type, Some("application/json"));
        assert_eq!(reply.json(), json!(expected), "{date}");
    }
    app.close().await;
}

#[tokio::test]
async fn detail_answers_date_off_day_and_name() {
    let app = TestApp::start().await;
    assert_eq!(
        detail(&app, "2026-01-01").await,
        json!({"date": "2026-01-01", "isOffDay": true, "name": "元旦"})
    );
    assert_eq!(
        detail(&app, "2026-01-10").await,
        json!({"date": "2026-01-10", "isOffDay": true, "name": ""})
    );
    app.close().await;
}

#[tokio::test]
async fn dates_are_checked_against_the_calendar() {
    let app = TestApp::start().await;
    for date in [
        "invalid",
        "2026-02-30",
        "2025-02-29",
        "2026-1-4",
        "2026-13-01",
        "20260101",
    ] {
        for path in ["/api/holiday/detail", "/api/holiday/is-holiday"] {
            let reply = app.get(&format!("{path}?date={date}")).await;
            assert_eq!(reply.status, StatusCode::BAD_REQUEST, "{path}?date={date}");
            assert_eq!(
                reply.json(),
                json!({"statusCode": 400, "message": ["日期格式错误，应为 YYYY-MM-DD"], "error": "Bad Request"})
            );
        }
    }
    app.close().await;
}

#[tokio::test]
async fn missing_or_empty_date_means_today_in_china() {
    let app = TestApp::start().await;
    let today = china_date(Timestamp::now()).to_string();
    for path in ["/api/holiday/detail", "/api/holiday/detail?date="] {
        let reply = app.get(path).await;
        assert_eq!(reply.json()["date"], json!(today), "{path}");
    }
    app.close().await;
}

#[tokio::test]
async fn refresh_keeps_the_year_when_the_source_is_empty_or_failing() {
    let app = TestApp::start().await;

    app.fake_source.respond(|path| {
        if path == "/2026.json" {
            plain_json(&json!({"days": []}))
        } else {
            holiday_cn(path)
        }
    });
    refresh::one_year(&app.pool, &app.source, 2026)
        .await
        .expect("拉到空的应当不算失败");
    assert_eq!(detail(&app, "2026-01-01").await["name"], "元旦");

    app.fake_source
        .respond(|_| (StatusCode::BAD_GATEWAY, "bad gateway").into_response());
    let error = refresh::one_year(&app.pool, &app.source, 2026)
        .await
        .expect_err("拉取失败应当报错");
    assert!(format!("{error:#}").contains("HTTP 502"), "{error:#}");
    assert_eq!(detail(&app, "2026-01-01").await["name"], "元旦");

    app.close().await;
}

#[tokio::test]
async fn refresh_replaces_the_whole_year() {
    let app = TestApp::start().await;
    app.fake_source.respond(|path| {
        if path == "/2026.json" {
            plain_json(&json!({"days": [{"name": "元旦", "date": "2026-01-02", "isOffDay": true}]}))
        } else {
            holiday_cn(path)
        }
    });
    refresh::one_year(&app.pool, &app.source, 2026)
        .await
        .expect("应当刷得进来");

    assert_eq!(
        detail(&app, "2026-01-02").await,
        json!({"date": "2026-01-02", "isOffDay": true, "name": "元旦"})
    );
    // 调休上班的那个周日不在新数据里了，回到按周末判断
    assert_eq!(
        detail(&app, "2026-01-04").await,
        json!({"date": "2026-01-04", "isOffDay": true, "name": ""})
    );
    app.close().await;
}

#[tokio::test]
async fn malformed_source_data_is_rejected() {
    let app = TestApp::start().await;
    app.fake_source.respond(|_| {
        plain_json(&json!({"days": [{"name": "元旦", "date": "2026-1-1", "isOffDay": true}]}))
    });
    let error = refresh::one_year(&app.pool, &app.source, 2026)
        .await
        .expect_err("格式不对应当报错");
    assert!(format!("{error:#}").contains("格式不对"), "{error:#}");
    assert_eq!(detail(&app, "2026-01-04").await["name"], "元旦");
    app.close().await;
}
