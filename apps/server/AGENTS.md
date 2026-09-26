# apps/server

后端：Elysia + Drizzle + PostgreSQL，由 Bun 直接运行 TypeScript 源码（见 ADR-0004、ADR-0007），没有构建步骤。全仓通用的约定见根目录 `AGENTS.md`，与 e 站打交道的部分另见 `src/eh/AGENTS.md`。

## 结构

代码在 `src/`，顶层按领域分模块：`auth`、`eh`、`holiday`，与前端的 feature 一一对应；另有 `health/`（Kubernetes 的探针：`live` 不碰任何依赖，`ready` 查一次数据库）。基础设施各是一个文件或目录：`config.ts`（环境变量）、`numeric.ts`（从字符串认数字）、`database/`（连接池与启动时迁移 `connection.ts`、建表共用的列 `columns.ts`）、`outbound.ts` 与 `outbound-fetch.ts`（出网：进程里用的那一份与测试的替换口、真实的实现）、`signing.ts`（从主密钥派生子密钥）、`http-error.ts`（可预期的失败）、`logger.ts`（日志）、`request-log.ts`（`/api` 下每个请求结束时记一行方法、路径、状态码与耗时）、`static-files.ts`（前端的静态文件）。迁移文件在 `drizzle/`，测试在 `test/`。镜像里前端产物放在 `client/`，由本服务一并提供静态文件。

没有依赖注入，也不装配对象图：模块本身就是单例。基础设施在被导入时按配置建好——`config.ts` 导出校验过的 `env`，`database/connection.ts` 导出整个进程共用的 `database`，`outbound.ts` 导出 `outbound`，`signing.ts` 导出两把子密钥——用到的模块直接 import。服务是一组导出函数的模块，进程内的缓存与状态是模块顶层的常量或变量；调用方用命名空间导入（`import * as galleryService from "@server/eh/gallery.service"`），调用处写 `galleryService.search(…)`，一眼看得出是哪个模块的。路由是模块级的 Elysia 实例（`*.routes.ts`），`eh` 的几组由 `eh.routes.ts` 汇总，`app.ts` 把各领域挂到 `/api` 下，并导出前端据以推断接口的 `App` 类型。`server.ts` 做导入之后、开始监听之前的事：执行迁移、刷新节假日数据、开定时任务；`main.ts` 开始监听、收到 SIGTERM 时关停。

模块顶层只放声明、建缓存，外加上面那几样基础设施，不在导入时调用别的模块的函数，初始化顺序就不成问题；模块之间的环由 lint 的 `import/no-cycle` 挡住。函数名可以短（`search`、`detail`），局部变量别与它重名（lint 的 `no-shadow` 会报，重名还会在运行时撞上「初始化之前访问」）。类只留给会有多个实例或要靠 `instanceof` 认的东西：`Logger`、`HttpError` 及其子类。要在测试里单独替换某个服务时，只把那个模块改成「工厂函数 + 默认实例」（`createXxx(deps)` 加上 `export const xxx = createXxx()`）：业务代码照旧引默认实例，测试调工厂传替身；不用 `vi.mock`。

表结构按领域写在各自模块的 `*.tables.ts` 里（`auth.tables.ts`、`eh.tables.ts`、`holiday.tables.ts`），改了之后，在本目录跑 `bunx drizzle-kit generate` 生成迁移（要连一个库做对比时给 `DATABASE_URL`）。

## 代码风格

引用 `src/` 下的模块一律用 `@server/` 路径别名，不写扩展名；测试引用源码也用它，测试支撑之间照旧用相对路径。别名只在 `tsconfig.json` 的 `paths` 里定义一份：Bun 运行时照它解析，Vitest 经 `resolve.tsconfigPaths` 解析，所以镜像里要带上它。别名不叫 `@/`：前端的类型检查会读到这里的源码（见下），前端自己的 `@/` 指向前端，两边要是同名就解析错了，前端的 tsconfig 里另有一份 `@server/*` 指到这里。

前端经 Eden 从 `App` 类型推断接口，它的类型检查按前端的配置读到这里所有被 `App` 追到的源码，所以这些代码要在前端的配置下也过得去：不写构造器参数属性（本包的 tsconfig 也开着 `erasableSyntaxOnly`），不用 ES2022 之后才有的内置方法（如 `toSorted`，前端的 `lib` 只到 ES2022）。

能用 Bun 原生 API 的地方用它：密码哈希 `Bun.password`，哈希与 HMAC `Bun.CryptoHasher`，数据库 `Bun.sql`，读文件 `Bun.file`。日志一律经 `logger.ts` 的 `Logger`，不直接写 `console`：每个模块在顶层建一个 `new Logger(import.meta.url)`，来源名由它算成这个模块在 `src/` 下的路径（与 `@server/` 的 import 路径一致、不带扩展名，如 `holiday/holiday.service`），不手写，日志里一眼对得上是哪个文件。

## 约定

约定大于配置：Elysia 默认能用的一律不写配置，非配不可的几处（校验失败回 400 而不是 422、文案不带字段路径，只回布尔值的 `is-holiday` 显式回 JSON）旁边注明原因。配置全来自环境变量，由 `config.ts` 用 zod 在模块被导入时校验一次，缺了或写错进程拒绝启动；清单与默认值见 `.env.example`，用到的模块从 `env` 里取，不直接读 `process.env`。主密钥只由 `signing.ts` 读取，业务代码只拿派生后的子密钥；子密钥的派生方式是已签发令牌的一部分，不能改；图片地址的签名算法改了，已发出、还没过期的地址会一齐作废，浏览器缓存的图也要重新取，改之前想清楚。

接口统一挂在 `/api` 下（`app.ts`），各领域的路由只写领域内的路径。路由的写法就是前端看到的接口契约：入参 schema 与处理函数的返回类型都会被前端推断出来，返回值要带着明确的类型：服务方法标注返回类型，响应类型定义在产出它的那个模块里（如 `eh/gallery-catalog.ts` 的 `GalleryCard`、`eh/upstream/parse.ts` 的评论），不放 `@myapi/shared`。入参在路由上挂 schema（`body`、`query`、`params`），请求体与查询串的 schema 放在 `@myapi/shared`（类型的写法见 `packages/shared/AGENTS.md`），前端预校验用的是同一份；路径与查询串里的数字先认成一串十进制数字再交给共享的规则（见 `numeric.ts`）。服务端私有的入参 schema（`eh/params.ts` 一类）同样不导出类型别名；输出恰好是已有的领域类型时（如路径上的图集定位就是 `GalleryRef`），schema 用 `satisfies z.ZodType<那个类型>` 对上它。Eden 按 schema 的**输出**类型推断前端要传什么，所以请求体与查询串的 schema 不做 transform（要转换的在处理函数里做，如阅读历史的游标），路径参数上的数字转换不受影响。路由只做入参转换，业务在服务里。

响应：成功直接返回数据，只回成败的接口返回 `undefined`（空体），成功一律 200。失败抛 `http-error.ts` 的 `HttpError`（常用的有 `badRequest`、`notFound` 这类工厂函数），由 `app.ts` 的 `onError` 统一回成 `{statusCode, message, error}`，`message` 是给用户看的中文；入参校验失败回 400，`message` 是一组去重的文案；不存在的路径与不对的方法回 404。未预料的异常回 500，原文只进日志。e 站那些可预期的失败见 `src/eh/AGENTS.md`。

鉴权不用 Passport（见 ADR-0001、ADR-0007）：`auth/tokens.ts` 用 `jose` 签发与校验 `Authorization: Bearer` 令牌，`auth/session.ts` 的两个插件把当前本站账号 id 放进上下文的 `userId`：要登录的一组路由 `use(signedIn)`，没登录回 401；公开接口上要认出登录者的用 `maybeSignedIn`，没登录时是 `null`。两个插件都在入参校验之前执行。公开接口的清单由接口测试按整张路由表锁住，新加一组路由漏了 `signedIn` 会让那条测试失败。

数据访问用 Drizzle（`drizzle-orm/bun-sql`，连接是 Bun 自带的 `SQL`，第一次查询就把连接池开满，默认 10 个），表结构写在各领域的 `*.tables.ts`，服务直接从那里引用表，连接直接引 `database`；不用 Drizzle 的关系查询，所以连接上不挂表结构，`database/` 也就不必认识各领域的表。时间列只存到毫秒（`timestamp(3)`），取出来是 `Date`：阅读历史的游标要把阅读时间原样交回数据库比较，库里存着微秒的话经 `Date` 一截就会漏行，upsert 的冲突分支自己写 `` updatedAt: sql`now()` ``。服务启动时先由迁移器执行 `drizzle/` 下没执行过的迁移，再开始监听；基线迁移是幂等的，对着已有的库只登记不改动。

出网只有一个出口：`outbound.ts` 的 `outbound`（形状就是 fetch，底下是 Bun 的 fetch，类型与真实实现在 `outbound-fetch.ts`），不跟随重定向，等响应头与两次数据之间各有超时（由它自己计；连接阶段约 10 秒的超时靠 Bun 的默认行为，见 `outbound-fetch.ts`），所有出网请求共用同一个 User-Agent 与超时配置；访问 e 站、图床、节假日数据源都经它，测试也只在这里替换（`outbound.ts` 的 `replaceOutbound`）。`outbound-fetch.ts` 不读配置，次接缝的测试直接用它。一个请求里要同时等两件互不依赖的事时用 `Promise.all`。进程内缓存用 `lru-cache`：同一个 key 的并发加载靠它的 `fetch()`（一定有值的用 `forceFetch()`）只跑一次、失败不进缓存，不另加锁。定时任务用 `croner`（节假日数据每日刷新，见 `holiday.service.ts`），关停时停掉。

## 测试

测试用 Vitest，跑在 Bun 运行时下（`bun --bun vitest run`），源码里的 `Bun.*` 才照常可用。主接缝是 HTTP 边界：`test/support/app.ts` 经 `startServer` 起一份完整的应用、监听 127.0.0.1 的随机端口，用 supertest 发请求，断言状态码、响应体、响应头与库里的最终状态；数据库是 Testcontainers 里的真 PostgreSQL（连接上限调到 200：各测试文件的应用同时在跑，每份都把连接池开满；每个测试文件一个独立的库，应用启动时照常跑迁移），唯一的替换点是出网——`FakeOutbound` 按请求回放内存响应、记下每个请求，缓存合并、换源重试这类行为就靠数发往上游的请求来验证。测试给的响应函数返回 `undefined` 表示没配这个请求，回一个一眼认得出的 599；最近一个请求用 `last()` 取，测试依赖的值用 `test/support/present.ts` 的 `present` 取，没有就当场失败。时间用 Vitest 的假时钟（只假 `Date`）。配置在应用的模块被导入时读定：`startApp` 先写进程的环境变量、换掉出网，再导入应用。每个测试文件各在一个进程里跑，同一个文件里的配置要一致，要另一套配置的放进另一个文件（如 `registration-closed.test.ts`）；启动失败不关连接池，同一个文件里可以接着再启动一次（见 `holiday-startup.test.ts`）。定时任务经 `holidayRefresh.trigger()` 当场跑一次。

次接缝是 `test/outbound.test.ts`：真实的出网实现对着本机 HTTP 服务，验证重定向、超时与断流这些主接缝测不到的网络语义。

## 配置

本地开发把 `.env.example` 复制成同目录的 `.env`（已被 Git 忽略），填主密钥与 PostgreSQL 连接；容器部署全用同名的环境变量。数据库账号要有建表、改表的权限：服务启动时自动执行迁移。
