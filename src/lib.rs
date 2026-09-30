//! MyAPI：节假日查询，纯 API 服务。领域术语见仓库根目录的 `CONTEXT.md`。
//!
//! 启动顺序见 [`server::start`]，接口的路由表在 `app` 模块。

mod app;
pub mod config;
mod error;
mod extract;
mod health;
pub mod holiday;
pub mod outbound;
pub mod server;
