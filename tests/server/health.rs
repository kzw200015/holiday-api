use axum::http::StatusCode;

use crate::support::TestApp;

/// 两个探针的状态码
async fn probe(app: &TestApp) -> (StatusCode, StatusCode) {
    let (live, ready) = tokio::join!(app.get("/api/health/live"), app.get("/api/health/ready"));
    (live.status, ready.status)
}

#[tokio::test]
async fn ready_fails_when_database_is_gone_while_live_stays_up() {
    let app = TestApp::start().await;
    assert_eq!(probe(&app).await, (StatusCode::OK, StatusCode::OK));

    app.database.drop_app_database().await;

    assert_eq!(
        probe(&app).await,
        (StatusCode::OK, StatusCode::SERVICE_UNAVAILABLE)
    );
    app.close().await;
}
