use std::net::SocketAddr;

use anyhow::Context;
use sqlx::PgPool;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::app;
use crate::holiday::refresh;
use crate::holiday::source::HolidaySource;

/// 监听中的服务。
pub struct Server {
    local_addr: SocketAddr,
    stop: oneshot::Sender<()>,
    serving: JoinHandle<std::io::Result<()>>,
    daily_refresh: JoinHandle<()>,
}

/// 按启动顺序把服务准备好并开始监听：先执行迁移，再刷新节假日数据，然后开每日刷新，最后才监听端口。
///
/// 哪一步失败都原样返回，进程随之退出。连接池归调用方所有，关停后由调用方关掉。
pub async fn start(
    addr: SocketAddr,
    pool: PgPool,
    source: HolidaySource,
) -> anyhow::Result<Server> {
    sqlx::migrate!()
        .run(&pool)
        .await
        .context("执行数据库迁移失败")?;
    refresh::on_startup(&pool, &source)
        .await
        .context("启动时刷新节假日数据失败")?;
    let listener = TcpListener::bind(addr)
        .await
        .with_context(|| format!("监听 {addr} 失败"))?;
    let local_addr = listener.local_addr()?;
    let daily_refresh = tokio::spawn(refresh::daily(pool.clone(), source));
    let (stop, stopped) = oneshot::channel();
    let serving = tokio::spawn(
        axum::serve(listener, app::router(pool))
            .with_graceful_shutdown(async {
                // 发送方被丢掉也算该停了
                stopped.await.ok();
            })
            .into_future(),
    );
    Ok(Server {
        local_addr,
        stop,
        serving,
        daily_refresh,
    })
}

impl Server {
    /// 实际监听的地址：按端口 0 启动时由系统分配端口。
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// 关停：停掉每日刷新，不再接新请求，等在途的请求处理完。
    pub async fn shutdown(self) -> anyhow::Result<()> {
        self.daily_refresh.abort();
        // 接收方已经没了说明服务早就停了，下面照样取它的结果
        self.stop.send(()).ok();
        self.serving.await?.context("服务异常退出")
    }
}
