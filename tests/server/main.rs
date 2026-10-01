//! 集成测试：经 HTTP 边界验证接口的响应、库里的最终状态、启动与定时刷新。
//!
//! 每个测试独占一个 PostgreSQL 容器（需要本机 Docker），节假日数据源换成本机的假数据源。
//! 所有测试编成一个测试二进制，只链接一次。

mod health;
mod holiday;
mod startup;
mod support;
