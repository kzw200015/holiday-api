# 照 eh-pwa 的后端架构，用 Bun + Hono + Drizzle 重写服务

服务原来是 Go（Echo + viper + sqlc + goose + wire），现在照 eh-pwa 后端的架构用 TypeScript 重写：Bun 直接运行源码，Hono 处理 HTTP，Drizzle 访问数据库并管迁移，zod 校验配置与入参，pino 记日志。两个项目用同一套写法、同一套工具链（oxlint、Prettier、Vitest + Testcontainers），约定在两边通用。Go 的实现与工具链全部删掉。这是重写而不是移植：旧实现只用来弄清对外行为。

几处取舍：

- **单个包，放在仓库根目录**：eh-pwa 是前后端加共享包的工作区，这里只有后端，不建工作区；`@server/` 别名照旧，代码在两个项目之间搬动时不用改 import。
- **不用依赖注入，模块就是单例**：配置、连接池、出网在模块被导入时建好，服务是导出函数的模块。测试只换出网，所以只给出网留一个替换口（`replaceOutbound`）；节假日数据源的地址写死在代码里，不再作为配置项。
- **基线迁移按空库建**：drizzle-kit 生成的原样，不接管 Go 版建的表。部署时先手工删掉旧表（`holiday_days`、`goose_db_version`），服务启动时建表、拉当年和次年的安排；节假日安排随时能从数据源重新拉，丢了无妨。
- **失败体照 eh-pwa 改成 `{code, message}`，`code` 与 HTTP 状态码相同**：取消 Go 版的 UPPER_SNAKE 错误码；`message` 一律是中文，入参不合格时是 schema 里的文案。方法不对照 Hono 的默认回 404，不再回 405。
- **定时刷新用 croner**：按 `Asia/Shanghai` 每天 4:30 跑一次，不手算下一次的时刻。
- **出网的超时自己计**：等响应头与两次数据之间各有 `OUTBOUND_TIMEOUT`，与 eh-pwa 一致；连接阶段约 10 秒的超时与 `HTTPS_PROXY` 交给 Bun 的 fetch。
- **日志改成 pino 的 JSON，并记 `/api` 下的请求日志**，与 eh-pwa 一致。

## Consequences

- 部署要跟着改：先删掉库里的旧表；`HOLIDAY_SOURCE_URL` 不再生效，连不上 GitHub 时经 `HTTPS_PROXY` 走代理；`LOG_LEVEL` 多了 pino 的几档（`fatal`、`trace`、`silent`）。
- 调用方要按新的失败体改错误处理：`code` 变成数字。
- Bun 不做类型检查，类型错误只有 `bun run typecheck` 能发现，提交前要跑。
- `Bun.sql` 第一次查询就把连接池开满（默认 10 个），常驻 10 个数据库连接。
- 连接阶段的超时依赖 Bun 未写进文档的默认行为，升级 Bun 后要复核。
- 配置在模块被导入时读定，一个测试文件只能有一套配置。
