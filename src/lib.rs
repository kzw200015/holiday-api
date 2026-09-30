//! MyAPI：节假日查询，纯 API 服务。领域术语见仓库根目录的 `CONTEXT.md`。
//!
//! 启动顺序见 [`server::start`]，接口见 [`app::router`]。

pub mod app;
pub mod config;
mod error;
mod health;
pub mod holiday;
pub mod outbound;
pub mod server;
