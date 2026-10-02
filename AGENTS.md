# Repository Guidelines

## 项目结构

MyAPI 提供节假日查询，是一个纯 API 服务，用 Go 写成：Echo + viper + sqlc（pgx）+ goose + wire（见 ADR-0001）。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。仓库根目录就是唯一的 Go 模块 `github.com/kzw200015/myapi`：

- `cmd/myapi/`：入口，只管信号与退出码，启动交给 `app.Run`。
- `internal/app/`：组装与启动。部件的构造由 wire 生成（`wire.go` 列出各包导出的构造函数，`wire_gen.go` 是生成的），`Run` 读配置、设日志，`run(ctx, cfg)` 组装后按顺序启动刷新、监听与关停（迁移在组装时由 `database.NewPool` 做，监听与关停交给 Echo 的 `StartConfig`）；生产经 `Run`，集成测试直接传配置给 `run`。
- `internal/`：其余应用代码。`holiday`（节假日查询）是领域；`config`（配置）、`database`（连接池）、`web`（HTTP 服务、失败体、探针）、`outbound`（出网客户端）是基础设施。
- `internal/holiday/db/`：sqlc 按 `internal/holiday/queries.sql` 与迁移生成的查库代码，不手改。
- `migrations/`：goose 的迁移 SQL，经 `embed` 编进二进制，启动时自动执行。
- `internal/app/*_test.go`：集成测试，经 HTTP 测整份应用。

Go 版本写在 `go.mod` 与 `Dockerfile` 的构建镜像标签里，升级时两处一起改。

## 构建与测试命令

在仓库根目录执行：

- `go run ./cmd/myapi`：启动服务（监听 8000）。配置只读环境变量，先把 `.env` 注入进来，见 `.env.example`。
- `go test ./...`：测试。集成测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。
- `golangci-lint run` / `golangci-lint fmt`：检查 / 格式化（golangci-lint v2，配置见 `.golangci.yml`）。
- `go tool sqlc generate`：改了 `queries.sql` 或迁移后重新生成 `internal/holiday/db/`，生成的代码一起提交。
- `go tool wire ./internal/app`：改了 `wire.go` 或构造函数的参数后重新生成 `wire_gen.go`，一起提交。
- `docker build -t myapi .`：打部署用的镜像。

只跑一部分测试时按名字过滤，例如 `go test -run 'TestRefresh' ./internal/app`。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行，Go 代码用 Tab 缩进。注释、日志与给调用方看的文案一律用简体中文；标识符用英文，按 Go 的命名惯例，测试函数名写成英文句子（`TestRefreshReplacesTheWholeYear`）。

Go 的惯用写法，但保持克制：标准库能做的不引库，不为了「更像框架」另起抽象或接口；Echo、pgx 有现成做法的照它们的来。格式交给 `golangci-lint fmt`，不手工调整。

错误一律返回，不 panic；返回前用 `fmt.Errorf("…: %w", err)` 补上是哪一步、哪一年，文案用中文。

## 模块与约定

顶层按领域分包，目前只有 `internal/holiday`。

- **组装**：依赖经 `NewXxx` 的参数传入，不用全局变量（日志除外，用 `slog` 的默认 logger）。各包导出自己的构造函数，要配置的直接收 `config.Config`、自己取要的那几项；各包不 import wire，也不声明 `ProviderSet`。构造函数统一列在 `internal/app/wire.go` 的 `wire.Build` 里，加了构造函数就加进去，再重新生成 `wire_gen.go`。构造函数只做「把部件造好、可以用了」：建连接池时顺带迁移（`database.NewPool`），拿到池子的部件都能确信表结构是最新的；启动刷新、后台任务、监听这些运行期的步骤不放进构造函数，显式写在 `run` 里。需要在测试里替换的东西做成配置项（如节假日数据源的地址 `HOLIDAY_SOURCE_URL`），不引 mock 库。
- **并发**：需要并发时用 `errgroup`；后台任务与 HTTP 服务挂在 `run` 的同一个 `errgroup` 上，进程关停时随之取消，`run` 等它们停下再返回。
- **配置**全来自环境变量（`internal/config`）：viper 只读环境变量，键名是环境变量的小写，默认值登记在 `defaults` 里，校验手写在 `validate` 里，缺了或写错进程拒绝启动。清单见 `.env.example`。
- **接口**统一以 `/api` 开头，各领域在 `Routes` 里挂到 `web.NewServer` 分好的 `echo.Group` 上。节假日的两条接口由自己的其他程序调用，路径与成功时的响应体改了要同步改调用方。入参用 Echo 的绑定（`echo.QueryParamsBinder`）解析；处理函数只做入参转换，业务在领域的 `Service` 里。响应体单独定义带 `json` 标签的结构体，不直接序列化领域类型。
- **响应**：成功时直接返回数据。失败统一回 `{code, message}`（`internal/web`），`code` 是 `ErrorCode` 里的 UPPER_SNAKE 码，HTTP 状态码照旧表达类别。Echo 自己拒绝的请求（入参解析不了、路径不存在、方法不对等）状态码照 Echo 的，`message` 用 Echo 的英文原话；处理函数要回特定的失败就返回 `*web.Error`；其余错误回 500 与「服务器出错了」，原文只进日志。5xx 的日志只在 `web.handleError` 里记：出事的地方不自己记，往外返回即可。
- **数据**：SQL 写在各领域的 `queries.sql` 里，由 sqlc 生成代码，领域的 `Store` 包一层，把生成的行转成领域类型。事务用 `pgx.BeginFunc`，批量插入用 sqlc 的 `:copyfrom`。改表结构就在 `migrations/` 下加一个 `<N>_描述.sql`（goose 的格式），已经执行过的迁移不改，改完重新生成 sqlc 的代码。
- **时间**：日期在代码里是 `time.Time`，一律是 UTC 零点。节假日安排是中国的：「今天」「今年」一律按北京时间算（`holiday.Today`），不依赖服务器时区。
- **出网**只经 `outbound.NewClient` 建出的客户端：统一的 User-Agent，不跟随重定向，连接超时 10 秒，整个请求最多 `OUTBOUND_TIMEOUT`。代理照 Go 的惯例读 `HTTPS_PROXY`。
- **定时任务**手写在后台任务里，按北京时间算下一次的时刻。
- **探针**是 `/api/health/live`（不碰任何依赖）与 `/api/health/ready`（数据库连得上）。迁移与启动时的刷新都做完才开始监听。
- **日志**用 `log/slog` 的文本格式，级别由 `LOG_LEVEL` 控制，默认 info。不记请求日志。

## 测试

重点验证可观察行为：接口的响应、库里的最终状态、启动与刷新。只测自己的逻辑：框架与库自身的行为（Echo 的路由与绑定、JSON 的解析、HTTP 客户端的超时等）不测，复述常量、声明或一行配置的测试也不写。断言用 testify 的 `require`。

集成测试在 `internal/app` 里，经 `run` 起应用、听空闲端口、经 HTTP 测。`TestMain` 起一个 PostgreSQL 18 的容器（Testcontainers），经 `config.Load` 读出共用的配置 `baseConfig`，起一份共用的应用，整个包共用；测试直接用的库与刷新器经 `initApp` 建出，和应用里的同一份组装；测共用应用的测试先调 `reset`：恢复假数据源、清表，再刷进 2026 年的安排。唯一的替换点是节假日数据源，换成本机的假数据源 `fakeSource`（`httptest.Server`），按请求路径回放内存里的响应，默认回放 `holidayCN`（只有 2026 年）。数据用固定的 2026 年，不随当前日期变；刷新直接调 `Refresher.OneYear`，不等到 4:30。要弄坏库或在启动之前摆好库的测试（探针、启动）用 `newDatabase` 在同一个容器里另建一个库，复制一份 `baseConfig` 把库指过去，再用 `mustStart` 起一份自己的应用。测试不改环境变量。

提交前运行 `go test ./...` 与 `golangci-lint run`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue。

## 配置与安全

本地开发把 `.env.example` 复制成根目录的 `.env`（已被 Git 忽略），填 PostgreSQL 连接，注入成环境变量后启动；容器部署全用同名的环境变量。数据库账号要有建表、改表的权限：服务启动时自动执行迁移。禁止提交凭据。
