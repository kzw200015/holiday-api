//! 测试支撑：起一份完整的应用，只有数据库（容器里的真 PostgreSQL）与节假日数据源（本机的假数据源）是换过的。

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use axum::Router;
use axum::http::header::CONTENT_TYPE;
use axum::http::{StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use myapi::holiday::refresh;
use myapi::holiday::source::HolidaySource;
use myapi::outbound;
use myapi::server::{self, Server};
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use testcontainers_modules::postgres::Postgres;
use testcontainers_modules::testcontainers::runners::AsyncRunner;
use testcontainers_modules::testcontainers::{ContainerAsync, ImageExt};
use tokio::net::TcpListener;

/// 一个测试独占的 PostgreSQL：容器随它一起删掉。应用连的是其中的 myapi 库，删库时经 postgres 库操作。
pub struct Database {
    _container: ContainerAsync<Postgres>,
    server: String,
}

impl Database {
    pub async fn start() -> Self {
        let container = Postgres::default()
            .with_db_name("myapi")
            .with_tag("18-alpine")
            .start()
            .await
            .expect("PostgreSQL 容器应当起得来");
        let host = container.get_host().await.expect("容器应当有主机地址");
        let port = container
            .get_host_port_ipv4(5432)
            .await
            .expect("容器应当映射出 5432 端口");
        Self {
            _container: container,
            server: format!("postgres://postgres:postgres@{host}:{port}"),
        }
    }

    pub fn url(&self) -> String {
        format!("{}/myapi", self.server)
    }

    /// 新建一个连到应用那个库的连接池，与应用各用各的。
    pub fn pool(&self) -> PgPool {
        PgPoolOptions::new()
            .connect_lazy(&self.url())
            .expect("连接串应当合法")
    }

    /// 强制断开所有连接并删掉应用的库，之后再连都会失败。
    pub async fn drop_app_database(&self) {
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect(&format!("{}/postgres", self.server))
            .await
            .expect("应当连得上 postgres 库");
        sqlx::query("DROP DATABASE myapi WITH (FORCE)")
            .execute(&admin)
            .await
            .expect("应当删得掉应用的库");
        admin.close().await;
    }
}

/// 按请求路径给出响应。
type Respond = dyn Fn(&str) -> Response + Send + Sync;

/// 假的节假日数据源：本机的 HTTP 服务，按请求路径回放内存里的响应，默认回放 [`holiday_cn`]。
/// 请求照样走完真实的出网客户端（拼地址、认状态码、校验数据）。
pub struct FakeSource {
    url: String,
    respond: Arc<Mutex<Arc<Respond>>>,
}

impl FakeSource {
    pub async fn start() -> Self {
        let respond: Arc<Mutex<Arc<Respond>>> = Arc::new(Mutex::new(Arc::new(holiday_cn)));
        let current = Arc::clone(&respond);
        let app = Router::new().fallback(async move |uri: Uri| {
            let respond = Arc::clone(&current.lock().unwrap_or_else(PoisonError::into_inner));
            respond(uri.path())
        });
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("假数据源应当监听得上");
        let url = format!(
            "http://{}",
            listener.local_addr().expect("假数据源应当有地址")
        );
        tokio::spawn(async move { axum::serve(listener, app).await });
        Self { url, respond }
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    /// 换掉回放的响应。
    pub fn respond(&self, respond: impl Fn(&str) -> Response + Send + Sync + 'static) {
        *self.respond.lock().unwrap_or_else(PoisonError::into_inner) = Arc::new(respond);
    }
}

/// holiday-cn 数据源：只有 2026 年有数据，其余年份的文件还没建出来（404）。2026-01-04 是调休上班的周日。
pub fn holiday_cn(path: &str) -> Response {
    if path == "/2026.json" {
        return plain_json(&json!({"days": [
            {"name": "元旦", "date": "2026-01-01", "isOffDay": true},
            {"name": "元旦", "date": "2026-01-04", "isOffDay": false},
        ]}));
    }
    (StatusCode::NOT_FOUND, "404: Not Found").into_response()
}

/// 数据源把 .json 按 text/plain 返回。
pub fn plain_json(value: &Value) -> Response {
    (
        [(CONTENT_TYPE, "text/plain; charset=utf-8")],
        value.to_string(),
    )
        .into_response()
}

/// 出网客户端指向这个地址时连不上：端口刚释放，没有人在听。
pub async fn unreachable_url() -> String {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("应当拿得到一个空闲端口");
    format!("http://{}", listener.local_addr().expect("应当有地址"))
}

pub fn holiday_source(base_url: &str) -> HolidaySource {
    // 绕开开发机上配的代理，请求直接到本机的假数据源
    let client = outbound::builder("test-agent", Duration::from_secs(5))
        .no_proxy()
        .build()
        .expect("出网客户端应当建得出来");
    HolidaySource::new(client, base_url)
}

/// 启动一份应用：照常执行迁移与启动时的节假日刷新，听 127.0.0.1 的随机端口。
pub async fn try_start(pool: PgPool, source: HolidaySource) -> anyhow::Result<Server> {
    server::start(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)), pool, source).await
}

/// 起好的一份应用，库里已经有 2026 年的节假日安排。
pub struct TestApp {
    pub database: Database,
    pub pool: PgPool,
    pub fake_source: FakeSource,
    pub source: HolidaySource,
    server: Server,
    base_url: String,
    http: reqwest::Client,
}

/// 接口的一次响应。
pub struct Reply {
    pub status: StatusCode,
    pub headers: reqwest::header::HeaderMap,
    pub text: String,
}

impl Reply {
    pub fn json(&self) -> Value {
        serde_json::from_str(&self.text).expect("响应体应当是 JSON")
    }
}

impl TestApp {
    pub async fn start() -> Self {
        let database = Database::start().await;
        let fake_source = FakeSource::start().await;
        let source = holiday_source(fake_source.url());
        let pool = database.pool();
        let server = try_start(pool.clone(), source.clone())
            .await
            .expect("应用应当起得来");
        // 不随当前年份变：直接把 2026 年的安排刷进库里
        refresh::one_year(&pool, &source, 2026)
            .await
            .expect("2026 年的安排应当刷得进来");
        let base_url = format!("http://{}", server.local_addr());
        Self {
            database,
            pool,
            fake_source,
            source,
            server,
            base_url,
            http: reqwest::Client::builder()
                .no_proxy()
                .build()
                .expect("HTTP 客户端应当建得出来"),
        }
    }

    pub async fn get(&self, path_and_query: &str) -> Reply {
        self.send(self.http.get(format!("{}{path_and_query}", self.base_url)))
            .await
    }

    pub async fn post(&self, path: &str) -> Reply {
        self.send(self.http.post(format!("{}{path}", self.base_url)))
            .await
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Reply {
        let response = request.send().await.expect("请求应当发得出去");
        let status = response.status();
        let headers = response.headers().clone();
        let text = response.text().await.expect("响应体应当读得完");
        Reply {
            status,
            headers,
            text,
        }
    }

    pub async fn close(self) {
        self.server.shutdown().await.expect("应用应当正常关停");
        self.pool.close().await;
    }
}
