# apps/server

后端：Hono + Drizzle + PostgreSQL，由 Bun 直接运行 TypeScript 源码（见 ADR-0004、ADR-0008），没有构建步骤。全仓通用的约定见根目录 `AGENTS.md`。

## 结构

代码在 `src/`，顶层按领域分模块，目前只有 `holiday`（节假日查询）；另有 `health/`（Kubernetes 的探针：`live` 不碰任何依赖，`ready` 查一次数据库）。基础设施各是一个文件或目录：`config.ts`（环境变量）、`validate.ts`（按 zod schema 校验入参）、`database/`（连接池与启动时迁移 `connection.ts`、建表共用的列 `columns.ts`）、`outbound.ts` 与 `outbound-fetch.ts`（出网：进程里用的那一份与测试的替换口、真实的实现）、`http-error.ts`（可预期的失败）、`logger.ts`（日志）、`request-log.ts`（`/api` 下每个请求结束时记一行方法、路径、状态码与耗时）。迁移文件在 `drizzle/`，测试在 `test/`。

没有依赖注入，也不装配对象图：模块本身就是单例。基础设施在被导入时按配置建好——`config.ts` 导出校验过的 `env`，`database/connection.ts` 导出整个进程共用的 `database`，`outbound.ts` 导出 `outbound`——用到的模块直接 import。服务是一组导出函数的模块，进程内的状态是模块顶层的常量或变量；调用方用命名空间导入（`import * as holidayService from "@server/holiday/holiday-service"`），调用处写 `holidayService.query(…)`，一眼看得出是哪个模块的。路由是模块级的 Hono 实例（`*-routes.ts`），只写本组内的路径，前缀由挂它的一方给：`app.ts` 把各领域挂到 `/api` 下。`server.ts` 按顺序执行迁移、刷新节假日数据、开定时任务，最后用 `Bun.serve` 开始监听；`main.ts` 给它端口、收到 SIGTERM 时关停。

模块顶层只放声明，外加上面那几样基础设施，不在导入时调用别的模块的函数，初始化顺序就不成问题；模块之间的环由 lint 的 `import/no-cycle` 挡住。函数名可以短（`query`、`fetchYear`），局部变量别与它重名（lint 的 `no-shadow` 会报，重名还会在运行时撞上「初始化之前访问」）。类只留给会有多个实例或要靠 `instanceof` 认的东西：`Logger`、`HttpError`。要在测试里单独替换某个服务时，只把那个模块改成「工厂函数 + 默认实例」（`createXxx(deps)` 加上 `export const xxx = createXxx()`）：业务代码照旧引默认实例，测试调工厂传替身；不用 `vi.mock`。

表结构按领域写在各自模块的 `*-tables.ts` 里（`holiday-tables.ts`），改了之后，在本目录跑 `bunx drizzle-kit generate` 生成迁移（要连一个库做对比时给 `DATABASE_URL`）。

## 代码风格

引用 `src/` 下的模块一律用 `@server/` 路径别名，不写扩展名；测试引用源码也用它，测试支撑之间照旧用相对路径。别名只在 `tsconfig.json` 的 `paths` 里定义一份：Bun 运行时照它解析，Vitest 经 `resolve.tsconfigPaths` 解析，所以镜像里要带上它。

能用 Bun 原生 API 的地方用它：数据库 `Bun.sql`，读文件 `Bun.file`。日志一律经 `logger.ts` 的 `Logger`，不直接写 `console`：每个模块在顶层建一个 `new Logger(import.meta.url)`，来源名由它算成这个模块在 `src/` 下的路径（与 `@server/` 的 import 路径一致、不带扩展名，如 `holiday/holiday-service`），不手写，日志里一眼对得上是哪个文件。

## 约定

约定大于配置：Hono 默认能用的一律不写配置，非配不可的几处（校验失败抛出而不是回响应、文案不带字段路径）旁边注明原因。配置全来自环境变量，由 `config.ts` 用 zod 在模块被导入时校验一次，缺了或写错进程拒绝启动；清单与默认值见 `.env.example`，用到的模块从 `env` 里取，不直接读 `process.env`。

接口统一挂在 `/api` 下（`app.ts`），各领域的路由只写领域内的路径。节假日的两条接口有外部调用方，路径与响应体就是对外的契约，改之前想清楚。服务方法标注返回类型，响应类型定义在产出它的那个模块里（如 `holiday/holiday-service.ts` 的 `HolidayDetail`），只有别的模块也要用的才导出。入参经 `validate.ts` 的 `validate("json" | "query" | "param", schema)` 挂在路由上，处理函数用 `c.req.valid(…)` 取校验过的值；schema 就近定义：只一条路由用的直接写在那条路由上，同一个文件里几条共用的放在文件顶上（如节假日的查询参数），跨文件共用的放离它们最近的共同模块（如日历日期在 `holiday/calendar-date.ts`，路由与数据源都按它认日期）。schema 不导出类型别名，服务的入参类型由服务自己写。处理函数拿到的是 schema 的输出，所以 `.default()` 与 `.transform()` 照常用。路由只做入参转换，业务在服务里。

响应：成功时 `c.json(数据)`，回 200。失败抛 `http-error.ts` 的 `HttpError`（常用的有 `badRequest`、`notFound` 这类工厂函数），由 `app.ts` 的 `onError` 统一回成 `{statusCode, message, error}`，`message` 是给调用方看的中文；入参校验失败回 400，`message` 是一组去重的文案（由 `validate.ts` 抛出）；不存在的路径与不对的方法由 `notFound` 回 404。未预料的异常回 500，原文只进日志。

数据访问用 Drizzle（`drizzle-orm/bun-sql`，连接是 Bun 自带的 `SQL`，第一次查询就把连接池开满，默认 10 个），表结构写在各领域的 `*-tables.ts`，服务直接从那里引用表，连接直接引 `database`；不用 Drizzle 的关系查询，所以连接上不挂表结构，`database/` 也就不必认识各领域的表。时间列只存到毫秒（`timestamp(3)`），取出来是 `Date`。服务启动时先由迁移器执行 `drizzle/` 下没执行过的迁移，再开始监听；基线迁移是幂等的，对着已有的库只登记不改动。Drizzle 用的是 1.0 的 RC（`drizzle-orm` 与 `drizzle-kit` 版本写死、一起升）：迁移按目录一个一个放（`时间戳_名字/migration.sql` 加 `snapshot.json`），迁移器按目录名登记，库里没登记的都会补上，不看时间先后；0.x 按时间戳只跑比最后一条更晚的，会跳过。

出网只有一个出口：`outbound.ts` 的 `outbound`（只发 GET，底下是 Bun 的 fetch，类型与真实实现在 `outbound-fetch.ts`），不跟随重定向，等响应头与两次数据之间各有超时（由它自己计；连接阶段约 10 秒的超时靠 Bun 的默认行为，见 `outbound-fetch.ts`），所有出网请求共用同一个 User-Agent 与超时配置；访问节假日数据源经它，测试也只在这里替换（`outbound.ts` 的 `replaceOutbound`）。`outbound-fetch.ts` 不读配置，次接缝的测试直接用它。一个请求里要同时等两件互不依赖的事时用 `Promise.all`。定时任务用 `croner`（节假日数据每日刷新，见 `holiday-service.ts`），关停时停掉。

## 测试

测试用 Vitest，跑在 Bun 运行时下（`bun --bun vitest run`），源码里的 `Bun.*` 才照常可用。主接缝是 HTTP 边界：`test/support/app.ts` 经 `startServer` 起一份完整的应用、监听 127.0.0.1 的随机端口，用 supertest 发请求，断言状态码、响应体、响应头与库里的最终状态；数据库是 Testcontainers 里的真 PostgreSQL（每个测试文件一个独立的库，应用启动时照常跑迁移），唯一的替换点是出网——`FakeOutbound` 按请求回放内存响应，默认回放节假日数据源（`holidaySource`）。测试给的响应函数返回 `undefined` 表示没配这个请求，回一个一眼认得出的 599；测试依赖的值用 `test/support/present.ts` 的 `present` 取，没有就当场失败。时间用 Vitest 的假时钟（只假 `Date`）。配置在应用的模块被导入时读定：`startApp` 先写进程的环境变量、换掉出网，再导入应用。每个测试文件各在一个进程里跑，同一个文件里的配置要一致，要另一套配置的放进另一个文件（如 `startup-config.test.ts`）；启动失败不关连接池，同一个文件里可以接着再启动一次（见 `holiday-startup.test.ts`）。定时任务经 `holidayRefresh.trigger()` 当场跑一次。

次接缝是 `test/outbound.test.ts`：真实的出网实现对着本机 HTTP 服务，验证重定向、超时与断流这些主接缝测不到的网络语义。

## 配置

本地开发把 `.env.example` 复制成同目录的 `.env`（已被 Git 忽略），填 PostgreSQL 连接；容器部署全用同名的环境变量。数据库账号要有建表、改表的权限：服务启动时自动执行迁移。
