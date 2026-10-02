# Repository Guidelines

## 项目结构

MyAPI 提供节假日查询，是一个纯 API 服务：Hono + Drizzle + PostgreSQL，由 Bun 直接运行 TypeScript 源码，没有构建步骤（见 ADR-0001）。架构照 eh-pwa 的后端，仓库根目录就是唯一的包。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。

代码在 `src/`，顶层按领域分模块，目前只有 `holiday`（节假日查询），另有 `health/`（Kubernetes 的探针：`live` 不碰任何依赖，`ready` 查一次数据库）。基础设施各是一个文件：`config.ts`（环境变量）、`database.ts`（连接池与启动时迁移）、`outbound.ts`（出网与测试的替换口）、`validate.ts`（按 zod schema 校验入参）、`logger.ts`（日志，底下是 pino）。`app.ts` 把各领域挂到 `/api` 下，`server.ts` 按启动顺序把服务准备好并监听，`main.ts` 给它端口、收到 SIGTERM 时关停。迁移文件在 `drizzle/`，测试在 `test/`。

Bun 的版本写在 `package.json` 的 `packageManager` 与 `Dockerfile` 的 `oven/bun` 镜像标签里，升级时两处一起改。

## 构建与测试命令

在仓库根目录执行：

- `bun install --frozen-lockfile`：按锁文件安装。
- `bun run dev`：`bun --watch` 启动服务（监听 8000，读根目录的 `.env`），日志经 pino-pretty 排版。
- `bun run typecheck`：类型检查。Bun 运行 TypeScript 时不检查类型，类型错误只有这一处能发现。
- `bun run test`：Vitest 跑在 Bun 下。测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。只跑一个文件：`bun --bun vitest run test/holiday.test.ts`。
- `bun run lint` / `bun run lint:fix`（oxlint）、`bun run format` / `bun run format:check`（Prettier）。
- `bunx drizzle-kit generate`：改了 `*-tables.ts` 后生成迁移。
- `docker build -t myapi .`：打部署用的镜像。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行、两空格缩进。注释、日志、给调用方看的文案、提交信息与文档使用简体中文。

格式由 Prettier 统一（无分号、双引号、120 列），import 顺序由 `@ianvs/prettier-plugin-sort-imports` 自动排，不要手工调整；lint 规则见 `.oxlintrc.jsonc`，其中 `curly` 要求所有 `if`/`for` 带花括号。标识符用 camelCase；文件名不用点分隔角色（写 `holiday-service.ts`，不写 `holiday.service.ts`），点只留给扩展名和工具认的后缀（`.test.ts`、`.config.ts`）。脚本注释用 `/* */`（导出 API 用 `/** */`）。

文件内自上而下：import、说明整个模块的注释、logger、类型（导出的在前）、常量与模块状态（`let` 变量）、导出函数、私有函数；导出函数按调用方用到的先后排，私有函数按被调用的先后跟在后面。

引用 `src/` 下的模块一律用 `@server/` 路径别名，不写扩展名；测试引用源码也用它，测试支撑之间照旧用相对路径。别名只在 `tsconfig.json` 的 `paths` 里定义一份：Bun 运行时照它解析，Vitest 经 `resolve.tsconfigPaths` 解析，所以镜像里要带上它。

`tsconfig.json` 开着 `strict` 与 `noUncheckedIndexedAccess`：按下标、解构取到的值都可能是 `undefined`。不写 `!` 非空断言，也不用类型断言冒充「一定有」，取不到的情况显式处理。`catch` 到的值不一定是 `Error`，不直接 `as Error`。

## 模块与约定

没有依赖注入，也不装配对象图：模块本身就是单例。基础设施在被导入时按配置建好——`config.ts` 导出校验过的 `env`，`database.ts` 导出整个进程共用的 `database`，`outbound.ts` 导出 `outbound`——用到的模块直接 import。服务是一组导出函数的模块，进程内的状态是模块顶层的变量；调用方用命名空间导入（`import * as holidayService from "@server/holiday/holiday-service"`），调用处写 `holidayService.query(…)`。路由是模块级的 Hono 实例（`*-routes.ts`），只写本组内的路径，前缀由 `app.ts` 给，一路链式写下来。模块顶层只放声明，外加上面那几样基础设施，不在导入时调用别的模块的函数；模块之间的环由 lint 的 `import/no-cycle` 挡住。不导出没有别处使用的东西。

- **配置**全来自环境变量，由 `config.ts` 用 zod 在模块被导入时校验一次，缺了或写错进程拒绝启动；清单与默认值见 `.env.example`，用到的模块从 `env` 里取，不直接读 `process.env`。约定大于配置：Hono、Bun 默认能用的一律不写配置。
- **接口**统一挂在 `/api` 下。节假日的两条接口由自己的其他程序调用，路径与成功时的响应体改了要同步改调用方。入参经 `validate.ts` 的 `validate("query", schema)` 挂在路由上，处理函数用 `c.req.valid(…)` 取；schema 就近定义在路由所在的文件。路由只做入参转换，业务在服务里；服务标注返回类型；类型只有一个源头，其余派生（如 `holiday-tables.ts` 的 `HolidayDetail` 就是表的一行）。查询串的怪癖在 schema 里消化掉（如空串的 `date` 转成省略），不漏进服务。
- **响应**：成功时 `c.json(数据)`。失败直接抛 Hono 的 `HTTPException`（`new HTTPException(503, { message: "…" })`），由 `app.ts` 的 `onError` 统一回成 `{code, message}`，`code` 与 HTTP 状态码相同，`message` 是一句中文，不放上游原话、地址这类细节；Hono 自己抛的 `HTTPException` 同样原样透传它的文案；入参不合格回 400，`message` 是 schema 里的文案；不存在的路径与不对的方法由 `notFound` 回 404。未预料的异常回 500 与「服务器出错了」，原文只进日志。
- **数据**用 Drizzle（`drizzle-orm/bun-sql`，连接是 Bun 自带的 `SQL`，第一次查询就把连接池开满，默认 10 个）。表结构写在各领域的 `*-tables.ts`，服务直接引用表与 `database`；不用关系查询。改了表结构就在根目录跑 `bunx drizzle-kit generate` 生成迁移，服务启动时先执行 `drizzle/` 下没执行过的迁移再监听。Drizzle 用的是 1.0 的 RC（`drizzle-orm` 与 `drizzle-kit` 版本写死、一起升）。日期列按 `YYYY-MM-DD` 的字符串进出（`date({ mode: "string" })`）。
- **时间**：节假日安排是中国的，「今天」「今年」一律按北京时间算（`Asia/Shanghai`），不依赖服务器时区。
- **出网**只有一个出口：`outbound.ts` 的 `outbound`（只收地址的 fetch，底下是 Bun 的 fetch），不跟随重定向，等响应头与两次数据之间各有 `OUTBOUND_TIMEOUT` 的超时（Bun fetch 自带的空闲超时关掉），统一的 User-Agent；代理由 Bun 的 fetch 读 `HTTPS_PROXY`。测试只在这里替换（`replaceOutbound`）。
- **刷新**：启动时一次（库里没有今年的安排就当场拉完、拉不到拒绝启动；有就放到后台），之后由 croner 每天北京时间 4:30 一次。同一时刻的几次刷新合成一次；关停时停止监听与 `stopRefreshing`（停下定时任务、等进行中的那次做完）同时进行，都结束后再关连接池。
- **日志**一律经 `logger.ts` 的 `createLogger(import.meta.url)` 拿到的 pino logger（每行一个 JSON 写到标准输出，级别由 `LOG_LEVEL` 定），按 pino 的原生写法调用，异常写成 `error(err, "说明")`，不直接写 `console`。`/api` 下的请求日志由 `app.ts` 挂上 Hono 自带的 `hono/logger`，转进 pino 并去掉着色符。
- **探针**是 `/api/health/live` 与 `/api/health/ready`。迁移与启动时的刷新都做完才开始监听。

## 测试

测试用 Vitest，命名为 `test/*.test.ts`，跑在 Bun 运行时下（`bun --bun vitest run`）。重点验证可观察行为：接口的响应、库里的最终状态、启动与刷新。只测自己的逻辑：框架与库自身的行为（Hono 的路由、zod 的日期规则、fetch 的超时与重定向等）不测，复述常量、声明或一行配置的测试也不写；出网的真实实现也不测。

主接缝是 HTTP 边界：`test/support/app.ts` 经 `startApp` 起一份完整的应用、监听 127.0.0.1 的随机端口，用 supertest 发请求。数据库是 Testcontainers 里的真 PostgreSQL，整个测试进程共用一个容器，每个测试文件一个独立的库（`createDatabase`），应用启动时照常跑迁移；在启动之前摆好库、或把库弄坏用 `test/support/database.ts` 的 `sql`。唯一的替换点是出网：`FakeOutbound` 按请求的地址回放内存响应，默认回放 `holidaySource`（只有 2026 年），没配的请求回一个一眼认得出的 599。数据用固定的 2026 年，不随当前日期变：用到「今年」的地方（刷新、启动）用 Vitest 的假时钟（只假 `Date`）定在 2026 年，刷新直接调服务的 `refresh`；`holiday.test.ts` 每个测试前恢复数据源、把 2026 年整年刷回 `holidaySource` 的安排。配置在应用的模块被导入时读定：`startApp` 先写进程的环境变量、换掉出网，再导入应用。每个测试文件各在一个进程里跑，同一个文件里的配置要一致，要另一个库或另一套配置的放进另一个文件（如 `health.test.ts` 要把库删掉）。

提交前运行 `bun run test`，并通过 `bun run lint`、`bun run format:check` 与 `bun run typecheck`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`docs:`、`chore:` 前缀（只改文档的用 `docs:`），用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue。

## 配置与安全

本地开发把 `.env.example` 复制成根目录的 `.env`（已被 Git 忽略），填 PostgreSQL 连接；容器部署全用同名的环境变量。数据库账号要有建表、改表的权限：服务启动时自动执行迁移。禁止提交凭据。
