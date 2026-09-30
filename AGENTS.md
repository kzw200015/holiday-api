# Repository Guidelines

## 项目结构

MyAPI 提供节假日查询，是一个纯 API 服务，用 Rust 写成（axum + sqlx + PostgreSQL，见 ADR-0001）。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。仓库根目录就是唯一的 crate `myapi`：

- `src/`：`main.rs` 只做组装（读配置、建连接池与出网客户端、启动、等信号关停），其余都在库里（`lib.rs`），集成测试经库启动整份应用。
- `migrations/`：sqlx 的迁移，编进二进制，启动时自动执行。`build.rs` 让 Cargo 盯着这个目录，只新增迁移文件也会重新编译。
- `tests/server/`：集成测试，编成一个测试二进制；单元测试就近写在各模块的 `#[cfg(test)] mod tests` 里。

Rust 的版本写在 `rust-toolchain.toml` 与 `Dockerfile` 的 `rust` 镜像标签里，升级时两处一起改。

## 构建与测试命令

在仓库根目录执行：

- `cargo run`：启动服务（监听 8000，读根目录的 `.env`）。
- `cargo test`：单元测试与集成测试。集成测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。
- `cargo clippy --all-targets -- -D warnings`：lint，规则见 `Cargo.toml` 的 `[lints]`。
- `cargo fmt` / `cargo fmt --check`：格式。

只跑一部分测试时按名字过滤，例如 `cargo test --test server holiday::`。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行。注释、文档注释、日志与给调用方看的文案一律用简体中文；标识符（含测试函数名）用英文，按 Rust 的命名惯例。

格式交给 `rustfmt` 的默认配置，不手工调整。clippy 开着 `pedantic`，只 allow 了几条写给库的使用者看的规则；个别地方确实不适用时就近 `#[expect(…, reason = "…")]` 并注明原因：哪天不再触发，编译器会提醒删掉它。文件名就是模块名，用 snake_case。

取不到的值显式处理：产品代码里不写 `unwrap()`、`expect()`，也不用 `as` 截断数值去冒充「一定装得下」，按业务给出合理的结果或返回错误。测试里用 `expect("…")` 当场失败，并在文案里说清缺了什么。

## 模块与约定

顶层按领域分模块，目前只有 `holiday`（节假日查询）；`health` 是 Kubernetes 的探针（`live` 不碰任何依赖，`ready` 查一次数据库）。基础设施各占一个文件：`config.rs`（环境变量）、`error.rs`（失败的响应）、`extract.rs`（失败时回 `ApiError` 的提取器）、`outbound.rs`（出网客户端）、`app.rs`（路由表）、`server.rs`（启动顺序与关停）。

- **状态显式传递**，不用全局单例：连接池经 axum 的 `State` 传给处理函数，其余依赖作为参数传进去。需要在测试里替换的东西（如节假日数据源的地址）做成构造参数，不引 mock 库。
- **配置**全来自环境变量，由 `Config::from_env` 在启动时校验一次，每一项的问题都列出来，缺了或写错进程拒绝启动。清单与默认值见 `.env.example`；用到的模块从 `Config` 取，不直接读环境变量。
- **接口**统一挂在 `/api` 下（`app.rs`），各领域的路由只写领域内的路径。节假日的两条接口有外部调用方，路径与响应体就是对外的契约，改之前想清楚。入参分两步：先用 `extract.rs` 的提取器（如查询参数用 `AppQuery`，不用 axum 自带的 `Query`）拆成字段，格式不对统一回 400；再由路由里的小函数按业务的规矩转成领域类型（如 `holiday/routes.rs` 的 `requested_date`）。路由只做入参转换，业务在领域模块里。
- **响应**：成功时回 `Json(数据)`。失败时返回 `error.rs` 的 `ApiError`，统一回成 `{statusCode, message, error}`，`message` 是给调用方看的中文，入参不合格时是一组文案。写错的路径回 404，方法不对回 405（带 `Allow` 头）。未预料的异常回 500，原文只进日志；处理请求时的 panic 也一样，由 `app.rs` 的 `CatchPanicLayer` 接住。
- **错误类型**：领域里能区分的失败用 `thiserror` 定义（如 `SourceError`），编排与启动流程用 `anyhow` 加上下文；记日志时用 `{error:#}` 带出整条原因链。
- **数据**用 sqlx 的运行时查询（`query_as` + `FromRow`），SQL 写在各领域的 `store.rs` 里，靠集成测试兜着。日期列是原生的 `date`，经 `jiff-sqlx` 与 `jiff::civil::Date` 互转。改表结构就在 `migrations/` 下加一个 `NNNN_描述.sql`，已经执行过的迁移不改。
- **时间**用 jiff。节假日安排是中国的：「今天」「今年」一律按北京时间算（`holiday::china_date`），时区在编译期嵌入，不依赖服务器时区与 tzdata。
- **出网**只经 `outbound::builder` 建出的客户端：统一的 User-Agent，不跟随重定向，连接超时 10 秒，之后按「多久没收到一个字节」计时，代理照环境变量走。
- **定时任务**是一个 tokio 任务：算出下一个北京时间 4:30，睡到那时刷新一次，跑完再算下一次；关停时取消它。
- **日志**用 `tracing`，每条带着模块路径；级别由 `RUST_LOG` 控制，默认 `info`。每个请求结束时由 `tower-http` 的 `TraceLayer` 记一行。

## 测试

重点验证可观察行为：接口的响应、库里的最终状态、启动与定时刷新。集成测试的主接缝是 HTTP 边界：`tests/server/support.rs` 的 `TestApp` 起一份完整的应用，听 127.0.0.1 的随机端口，每个测试独占一个 PostgreSQL 18 容器，测完随即删掉；唯一的替换点是节假日数据源，换成本机的假数据源 `FakeSource`，按请求路径回放内存里的响应，默认回放 `holiday_cn`（只有 2026 年）。数据用固定的 2026 年，不随当前日期变；刷新直接调 `holiday::refresh::one_year`，不等到 4:30。

次接缝是 `tests/server/outbound.rs`：真实的出网客户端对着本机的 TCP 服务，验证重定向、超时与断流这些主接缝测不到的网络语义。测试里的 HTTP 客户端一律 `.no_proxy()`，不受开发机代理的影响。

提交前运行 `cargo test`，并通过 `cargo clippy --all-targets -- -D warnings` 与 `cargo fmt --check`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue。

## 配置与安全

本地开发把 `.env.example` 复制成根目录的 `.env`（已被 Git 忽略），填 PostgreSQL 连接；容器部署全用同名的环境变量。数据库账号要有建表、改表的权限：服务启动时自动执行迁移。禁止提交凭据。
