//! 真实的出网客户端对着本机的 TCP 服务：主接缝的测试只在数据源一层换响应，这几条网络语义只能在这里验证。

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use axum::http::StatusCode;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::sleep;

use crate::support::{listen_locally, outbound_client};

/// 起一个本机的 TCP 服务，每个连接先读完请求头，把它交给 `handle` 自己写响应。
async fn serve<F>(handle: impl Fn(Vec<String>, TcpStream) -> F + Send + 'static) -> String
where
    F: Future<Output = ()> + Send + 'static,
{
    let (listener, url) = listen_locally().await;
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let mut reader = BufReader::new(stream);
            let mut head = Vec::new();
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).await.unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
                head.push(line.trim_end().to_owned());
            }
            tokio::spawn(handle(head, reader.into_inner()));
        }
    });
    url
}

async fn write(stream: &mut TcpStream, bytes: &str) {
    stream
        .write_all(bytes.as_bytes())
        .await
        .expect("应当写得出去");
}

#[tokio::test]
async fn redirects_are_not_followed_and_user_agent_is_sent() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let seen = Arc::clone(&requests);
    let url = serve(move |head, mut stream| {
        seen.lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(head);
        async move {
            write(
                &mut stream,
                "HTTP/1.1 302 Found\r\nLocation: /internal\r\nContent-Length: 0\r\n\r\n",
            )
            .await;
        }
    })
    .await;

    let client = outbound_client(Duration::from_secs(1));
    let response = client
        .get(format!("{url}/data"))
        .send()
        .await
        .expect("应当拿到响应");

    assert_eq!(response.status(), StatusCode::FOUND);
    let requests = requests.lock().unwrap_or_else(PoisonError::into_inner);
    assert_eq!(requests.len(), 1, "只该有一次请求：{requests:?}");
    let head = &requests[0];
    assert_eq!(head.first().map(String::as_str), Some("GET /data HTTP/1.1"));
    assert!(
        head.iter()
            .any(|line| line.eq_ignore_ascii_case("user-agent: test-agent")),
        "{head:?}"
    );
}

#[tokio::test]
async fn timeout_counts_idle_time_not_total_time() {
    let url = serve(|_, mut stream| async move {
        write(&mut stream, "HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\n").await;
        for _ in 0..6 {
            write(&mut stream, "x").await;
            sleep(Duration::from_millis(100)).await;
        }
    })
    .await;

    let client = outbound_client(Duration::from_millis(300));
    let response = client.get(&url).send().await.expect("应当拿到响应");
    assert_eq!(
        response
            .text()
            .await
            .expect("慢慢传、总时长超过超时也应当读完"),
        "xxxxxx"
    );
}

#[tokio::test]
async fn stalled_body_times_out() {
    let url = serve(|_, mut stream| async move {
        write(
            &mut stream,
            "HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nx",
        )
        .await;
        sleep(Duration::from_secs(5)).await;
    })
    .await;

    let client = outbound_client(Duration::from_millis(200));
    let response = client.get(&url).send().await.expect("应当拿到响应头");
    let error = response
        .bytes()
        .await
        .expect_err("头发出来之后一直没有字节进来就应当超时");
    assert!(error.is_timeout(), "{error:?}");
}

#[tokio::test]
async fn missing_headers_time_out() {
    let url = serve(|_, stream| async move {
        // 连接一直开着，只是不回
        sleep(Duration::from_secs(5)).await;
        drop(stream);
    })
    .await;

    let client = outbound_client(Duration::from_millis(200));
    let error = client
        .get(&url)
        .send()
        .await
        .expect_err("迟迟不回响应头就应当超时");
    assert!(error.is_timeout(), "{error:?}");
}

#[tokio::test]
async fn truncated_body_is_an_error() {
    let url = serve(|_, mut stream| async move {
        write(
            &mut stream,
            "HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\n",
        )
        .await;
        write(&mut stream, &"x".repeat(100)).await;
        // 传到一半断开连接
    })
    .await;

    let client = outbound_client(Duration::from_secs(1));
    let response = client.get(&url).send().await.expect("应当拿到响应头");
    assert!(
        response.bytes().await.is_err(),
        "传到一半断了应当读失败，而不是当成读完"
    );
}
