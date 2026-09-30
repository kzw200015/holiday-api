use axum::http::StatusCode;
use axum::http::header::ALLOW;
use serde_json::json;

use crate::support::TestApp;

#[tokio::test]
async fn unknown_paths_get_json_404() {
    let app = TestApp::start().await;
    for path in ["/api/unknown", "/api", "/nowhere", "/"] {
        let reply = app.get(path).await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "{path}");
        assert_eq!(
            reply.json(),
            json!({"statusCode": 404, "message": "这个地址不存在", "error": "Not Found"})
        );
    }
    app.close().await;
}

#[tokio::test]
async fn wrong_method_gets_json_405_with_allow() {
    let app = TestApp::start().await;
    let reply = app.post("/api/holiday/detail").await;
    assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(
        reply.json(),
        json!({"statusCode": 405, "message": "不支持这个请求方法", "error": "Method Not Allowed"})
    );
    let allow = reply
        .headers
        .get(ALLOW)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    assert!(allow.contains("GET"), "Allow: {allow}");
    app.close().await;
}
