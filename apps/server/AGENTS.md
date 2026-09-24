# apps/server

后端：NestJS 12（Express 适配器）+ Drizzle + PostgreSQL，ESM、Node 24。全仓通用的约定见根目录 `AGENTS.md`，与 e 站打交道的部分另见 `src/eh/AGENTS.md`。

## 结构

代码在 `src/`，顶层按领域分模块：`auth`、`eh`、`holiday`，与前端的 feature 一一对应；另有基础模块 `config.ts`（环境变量）、`numeric.ts`（从字符串认数字）、`database/`（连接池、表结构 `schema.ts`、启动时迁移）、`outbound/`（出网）、`signing/`（从主密钥派生子密钥）、`request-log.ts`（`/api` 下每个请求结束时记一行方法、路径、状态码与耗时）。迁移文件在 `drizzle/`，测试在 `test/`。镜像里前端产物放在 `client/`，由本服务一并提供静态文件。

改了 `src/database/schema.ts` 之后，在本目录跑 `pnpm exec drizzle-kit generate` 生成迁移（要连一个库做对比时给 `DATABASE_URL`）。

## 代码风格

源码关掉了 lint 的 `consistent-type-imports`：Nest 靠装饰器元数据在运行时拿到构造器参数的类，注入的类必须按值导入。

## 约定

约定大于配置：Nest 与各官方模块默认能用的一律不写配置，非配不可的几处（静态文件只在根路径回 `index.html`、校验失败的文案不带字段路径、登录与搜索回 200）旁边注明原因。配置全来自环境变量，由 `config.ts` 用 zod 在启动时校验，缺了或写错进程拒绝启动；清单与默认值见 `.env.example`，业务代码经 `ConfigService<Env, true>` 读取。主密钥只由 `signing` 模块读取，业务类只拿派生后的子密钥；子密钥的派生方式与图片地址的签名算法是已签发令牌、已发出地址的一部分，不能改。

入参校验统一走全局的 `StandardSchemaValidationPipe`：控制器参数上挂 schema（`@Body({ schema })`、`@Query({ schema })`、`@Param({ schema })`），请求体与查询串的 schema 放在 `@myapi/shared`（命名类型的约定见 `packages/shared/AGENTS.md`），前端预校验用的是同一份；路径与查询串里的数字先认成一串十进制数字再交给共享的规则（见 `numeric.ts`）。服务端私有的 schema（`eh/params.ts` 一类）只导出输出类型；输出恰好是已有的领域类型时（如路径上的图集定位就是 `GalleryRef`），schema 用 `satisfies z.ZodType<那个类型>` 对上它，控制器直接用那个类型，不另起别名。控制器只做入参转换，业务在服务里；接口统一由 `AppModule` 里的 `RouterModule` 挂到 `/api` 下，控制器只写领域内的路径。

响应用 Nest 的默认结构：成功直接返回数据，只回成败的接口回空体；失败抛 Nest 自带的 HTTP 异常，响应体是 `{statusCode, message, error}`，`message` 是给用户看的中文（校验失败时是一组文案）。未预料的异常由 Nest 回 500，原文只进日志。e 站那些可预期的失败见 `src/eh/AGENTS.md`。

鉴权不用 Passport（见 ADR-0001）：全局 `AuthGuard` 用 `@nestjs/jwt` 认 `Authorization: Bearer` 令牌，接口默认要求登录，公开接口标 `@Public()`；控制器用 `@CurrentUser()` 拿当前本站账号 id，公开接口上没登录时是 `null`。公开接口清单由接口测试按整张路由表锁住。

数据访问用 Drizzle（`drizzle-orm/node-postgres`），表结构写在 `database/schema.ts`，经 `@Inject(DATABASE)` 注入。时间列只存到毫秒（`timestamp(3)`），取出来是 `Date`：阅读历史的游标要把阅读时间原样交回数据库比较，库里存着微秒的话经 `Date` 一截就会漏行，upsert 的冲突分支自己写 `` updatedAt: sql`now()` ``。服务启动时由迁移器自动执行 `drizzle/` 下没执行过的迁移；基线迁移是幂等的，对着已有的库只登记不改动。

出网只有一个出口：`outbound` 模块提供的 `Outbound`（形状就是 fetch，底下是 undici），不跟随重定向，等响应头与两次数据之间各有超时，所有出网请求共用同一个 User-Agent 与超时配置；访问 e 站、图床、节假日数据源都经它，测试也只在这里替换。一个请求里要同时等两件互不依赖的事时用 `Promise.all`。进程内缓存用 `lru-cache`：同一个 key 的并发加载靠它的 `fetch()`（一定有值的用 `forceFetch()`）只跑一次、失败不进缓存，不另加锁。

## 测试

主接缝是 HTTP 边界：`test/support/app.ts` 起一份完整的应用，用 supertest 发请求，断言状态码、响应体、响应头与库里的最终状态；数据库是 Testcontainers 里的真 PostgreSQL（每个测试文件一个独立的库，应用启动时照常跑迁移），唯一的替换点是出网——`FakeOutbound` 按请求回放内存响应、记下每个请求，缓存合并、换源重试这类行为就靠数发往上游的请求来验证。测试给的响应函数返回 `undefined` 表示没配这个请求，回一个一眼认得出的 599；最近一个请求用 `last()` 取，测试依赖的值用 `test/support/present.ts` 的 `present` 取，没有就当场失败。时间用 Vitest 的假时钟（只假 `Date`）。应用的配置在模块导入时就读定了，需要另一套环境变量的测试放进单独的文件。

次接缝是 `test/outbound.test.ts`：真实的出网实现对着本机 HTTP 服务，验证重定向、超时与断流这些主接缝测不到的网络语义。`test/legacy.test.ts` 里的令牌与图片地址是 Kotlin 版签出的原样结果，用来锁住兼容性，不要改。

## 配置

本地开发把 `.env.example` 复制成同目录的 `.env`（已被 Git 忽略），填主密钥与 PostgreSQL 连接；容器部署全用同名的环境变量。数据库账号要有建表、改表的权限：服务启动时自动执行迁移。
