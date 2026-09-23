# Repository Guidelines

## 项目结构

MyAPI 提供账号、图集浏览和节假日查询。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。仓库是 pnpm 工作区（见 ADR-0003），三个包：

- `apps/server`：后端，NestJS 12（Express 适配器）+ Drizzle + PostgreSQL，全仓 ESM、Node 24。
- `apps/web`：前端，Vue 3 + Vite。
- `packages/shared`（包名 `@myapi/shared`）：前后端共用的接口契约——请求的 zod schema 与响应的类型。它是标准的工作区包，`tsc` 编译到 `dist`、经 `exports` 暴露，两端都照普通依赖引用，不用路径别名直连源码；改了它要先构建（`pnpm dev` 会一直 watch）。

镜像里前端产物放在后端旁边（`apps/server/client`），由后端统一提供 API 与静态文件。

后端代码在 `apps/server/src/`，顶层按领域分模块：`auth`、`eh`、`holiday`，与前端的 feature 一一对应；另有基础模块 `config.ts`（环境变量）、`database/`（连接池、表结构 `schema.ts`、启动时迁移）、`outbound/`（出网）、`signing/`（从主密钥派生子密钥）。`eh/upstream/` 是与 e 站打交道的协议层（身份与站点、请求与「200 但不是内容」的失败识别、HTML 解析、图片主机白名单），只在 `eh` 模块内使用。迁移文件在 `apps/server/drizzle/`，测试在 `apps/server/test/`。

前端 `apps/web/src/` 分三块：`app/` 是应用装配（路由、全局布局、导航目录、主题）；`features/` 下每块业务自成一体（`auth`、`eh`、`holiday`，与后端领域模块对应）；`shared/` 放与业务无关的通用能力（HTTP 客户端、读取与写入排队的工具、通用组件与组合式函数）。`src/components/ui/` 与 `src/lib/utils.ts` 是 shadcn-vue 生成的源码，保持原样：已排除在 Prettier 与 oxlint 之外，清理代码或用 IDE 格式化时也别碰。静态资源在 `apps/web/public/`，测试在 `apps/web/tests/`。

feature 内按角色分文件：`api.ts` 只管 HTTP 调用，领域类型直接从 `@myapi/shared` 取，`labels.ts` 一类放展示用的中文词汇，`store.ts` 放跨页面共享的状态（pinia），`composables/` 把数据和交互包成页面能直接用的形状，`components/` 与 `views/` 是界面。依赖只有一个方向：`views` → `composables` → `api`/`store` → `shared/`，页面不直接调接口，`shared/` 不反向引用 `features/` 或 `app/`（`@myapi/shared` 是独立的包，哪一层都可以引用）。多个 feature 拼到一个界面上只在 `app/` 层发生（如设置页同时用 `auth` 与 `eh`）；feature 之间唯一允许的引用是依赖 `auth` 的会话状态，因为换账号要让各自的缓存与在途请求作废。

## 构建与测试命令

在仓库根目录执行：

- `pnpm install --frozen-lockfile`：用 `packageManager` 指定的 pnpm 版本按锁文件安装。
- `pnpm dev`：同时启动共享包的 watch、后端（`nest start --watch`，监听 8000，读 `apps/server/.env`）与 Vite（`/api` 代理到 `localhost:8000`）。
- `pnpm build`：按依赖顺序构建共享包、后端、前端（前端含类型检查）。
- `pnpm test`：三个包的 Vitest 各跑一次。后端测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。
- `pnpm lint` / `pnpm lint:fix`（oxlint）、`pnpm format` / `pnpm format:check`（Prettier），全仓一份配置。

只动一个包时可以用 `pnpm --filter <包名> <脚本>`（包名是 `server`、`web`、`@myapi/shared`），例如 `pnpm --filter server exec vitest run test/images.test.ts` 只跑一个测试文件。改了 `apps/server/src/database/schema.ts` 之后，在 `apps/server` 下跑 `pnpm exec drizzle-kit generate` 生成迁移（要连一个库做对比时给 `DATABASE_URL`）。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行、两空格缩进。注释、提交信息与文档使用简体中文。

格式由根目录的 Prettier 统一（无分号、双引号、120 列），import 顺序由 `@ianvs/prettier-plugin-sort-imports` 自动排，不要手工调整；lint 规则见根目录的 `.oxlintrc.json`，其中 `curly` 要求所有 `if`/`for` 带花括号。后端源码关掉了 `consistent-type-imports`：Nest 靠装饰器元数据在运行时拿到构造器参数的类，注入的类必须按值导入。TypeScript 标识符用 camelCase，脚本注释用 `/* */`（导出 API 用 `/** */`）。

前端组件文件名用 PascalCase，组合式函数用 `useX`。业务组件用 `<script setup lang="ts">`，组件名从文件名推导，KeepAlive 按它匹配，需要别的名字时用 `defineOptions`；props、emits 与双向绑定用类型化的 `defineProps`、`defineEmits`、`defineModel`，不用渲染函数模拟模板。使用 `@/` 路径别名，SFC 导入显式带 `.vue`。模板注释用 `<!-- -->`。

危险操作的按钮用 `variant="destructive"`（红字、无底色，独立按钮再加一圈淡红描边）；代价大、不可撤销的（清空、解绑）先经 `shared/components/ConfirmDialog` 确认，只有对话框里的确认键是实心红。「回上一级」按钮在顶栏，由路由的 `meta.back` 声明，页面里不另放一份；浏览器历史的上一条正好是目标页时退回去，否则原地替换（`shared/composables/useGoBack`），历史里不留重复的一条。

## 后端约定

约定大于配置：Nest 与各官方模块默认能用的一律不写配置，非配不可的几处（静态文件只在根路径回 `index.html`、校验失败的文案不带字段路径、登录与搜索回 200）旁边注明原因。配置全来自环境变量，由 `config.ts` 用 zod 在启动时校验，缺了或写错进程拒绝启动；清单与默认值见 `apps/server/.env.example`，业务代码经 `ConfigService<Env, true>` 读取。主密钥只由 `signing` 模块读取，业务类只拿派生后的子密钥；子密钥的派生方式与图片地址的签名算法是已签发令牌、已发出地址的一部分，不能改。

入参校验统一走全局的 `StandardSchemaValidationPipe`：控制器参数上挂 schema（`@Body({ schema })`、`@Query({ schema })`、`@Param({ schema })`），请求体与查询串的 schema 放在 `@myapi/shared`，前端预校验用的是同一份；路径与查询串里的数字先认成一串十进制数字再交给共享的规则（见 `eh/params.ts`）。控制器只做入参转换，业务在服务里。

响应用 Nest 的默认结构：成功直接返回数据，只回成败的接口回空体；失败抛 Nest 自带的 HTTP 异常，响应体是 `{statusCode, message, error}`，`message` 是给用户看的中文（校验失败时是一组文案）。未预料的异常由 Nest 回 500，原文只进日志。e 站那些可预期的失败与文案集中在 `eh/upstream/failures.ts`：「过会儿再试」的回 429，要用户自己处理的（Cookie 不对）回 400，e 站没连上或回了意料之外的东西回 502，细节只进日志。

鉴权不用 Passport（见 ADR-0001）：全局 `AuthGuard` 用 `@nestjs/jwt` 认 `Authorization: Bearer` 令牌，接口默认要求登录，公开接口标 `@Public()`；控制器用 `@CurrentUser()` 拿当前本站账号 id，公开接口上没登录时是 `null`。公开接口清单由接口测试按整张路由表锁住。

数据访问用 Drizzle（`drizzle-orm/node-postgres`），表结构写在 `database/schema.ts`，经 `@Inject(DATABASE)` 注入。时间列按字符串取出（保留微秒，阅读历史的游标要原样交回数据库比较），upsert 的冲突分支自己写 `` updatedAt: sql`now()` ``。服务启动时由迁移器自动执行 `drizzle/` 下没执行过的迁移；基线迁移是幂等的，对着已有的库只登记不改动。

出网只有一个出口：`outbound` 模块提供的 `Outbound`（形状就是 fetch，底下是 undici），不跟随重定向，等响应头与两次数据之间各有超时；访问 e 站、图床、节假日数据源都经它，测试也只在这里替换。图片地址只接受 `ehgt.org` 与 `*.hath.network` 的 https 地址（`eh/upstream/image-hosts.ts`），取图不带 Cookie。一个请求里要同时等两件互不依赖的事时用 `Promise.all`。进程内缓存用 `lru-cache`：同一个 key 的并发加载靠它的 `fetch()` 只跑一次、失败不进缓存，不另加锁；图集元数据把同一轮事件循环里缺的攒成一批向上游要（`eh/gallery-catalog.ts`）。本站账号的 e 站凭据每次从库里读，不缓存。

## 前端数据层

服务端数据的读取只写在 feature 的 `composables/` 里，页面拿到的是包好的 `loading`、`errorMessage` 与数据。数据放在哪，看它要在哪些页面之间共用：只在一个页面里用的（评论、节假日、搜索结果、阅读历史）活在组件里，单次读取用 `shared/composables/useRequest`，列表一律触底加载、用 `useCursorPages`，不做上一页下一页；页面被 KeepAlive 留着，界面状态（输入草稿、滚动位置、展开状态）和数据也就一起留着，不另设缓存。跨页面共用的放 feature 的 `store.ts`，即 `eh` 的本站账号数据（浏览偏好、搜索历史、绑定状态）与图集详情。「旧响应不算数」只由 `shared/api/request.ts` 的 `createRequest` 负责：同一路读取只认最后发起的那次，参数一变、组件销毁或 store 作废就取消在途请求，迟到的响应什么也不写，页面和 store 不再自己比对 signal 或数版本号。不自动重试，也不在窗口聚焦或网络重连时重取，失败交给用户点重试。

本站账号数据只读一次（`load()` 只在没有数据、也不在读时发请求）：本地那份才是用户正在用的，回头再读只会拿服务端的旧值盖掉用户刚改的。改动先落进 store 让界面当场跟上，保存经 `createQueue` 排队依次发出（整份提交一旦乱序，后到的旧快照会把新的顶掉）。接口是整份 `PUT`，只回成败，存不上既不回滚也不提示。顺序、去重、留几条这类规则归前端，服务端只校验、落库，所以会被服务端退回的内容（如超过 200 字节的搜索词）前端要先挡掉，否则之后每次整份提交都跟着失败；挡的规则直接用 `@myapi/shared` 里服务端校验用的同一份 schema，不另写一份。代价是放弃跨设备同步（别处改了要刷新才看得见），写失败会静默不一致。偏好与搜索历史由 `EhLayout` 读齐后才创建页面组件，因为搜索页的第一次查询要用分类偏好；读不到就停在布局层让用户重试，不拿默认值放行——整份提交配上一份没读到的空值，会把服务端原有的内容冲掉，出于同样的原因，偏好、搜索历史没读到时都不改也不发保存（阅读器不在这个布局里，偏好没读到时自动翻页间隔调不了）。绑定状态同样只读一次，换绑成功后直接用接口返回的新状态。

图集详情在 `useGalleryContentStore` 里按图集存一份，详情页和阅读器共用，5 分钟内再进不重取；过期重取失败时手上那份照常用、只给个提示，图片地址签的有效期远比新鲜期长。阅读进度就是详情里的字段，不另存一份，翻页时改的就是这份详情；重取在途时本地改过进度，响应落地以本地为准。进度上报不排队、当场发出，每次带上这次页面加载的上报方标识和递增序号，服务端只认同一上报方更新的那次，乱序到达也不会让进度回退；排队的话，页面卸载时补发的那次要等前一次回来，那时页面已经没了，`keepalive` 也救不了还没发出的请求。外加合并窗口，免得一本两百页发两百个请求：窗口从一轮第一次翻页起算、到点就发，不随后面的翻页往后推，否则一秒一页的自动翻页一次都发不出去。阅读器一个实例只读一本（`app/App.vue` 用 `readerInstanceKey` 按图集重建），所以窗口里只留一个待发页码，离开阅读页、手改地址换图集、页面收到后台和卸载时都要 `flush()`，换过本站账号就不再发，见 `useReadingProgress`。阅读历史每次读取前先等已经发出的进度保存落地，否则刚退出阅读时读回的还是上报之前的页码。删除或清空阅读历史时，把相关图集详情里的进度一并抹成 `null`，否则重进详情会显示一个服务端已经没有的页码。

作废分两种。换绑 e 站账号时调 `useGalleryContentStore().reset()`：详情全部丢掉、`revision` 加一，评论、搜索结果、阅读历史监听它，各自从第一页重来（被 KeepAlive 留着的搜索页不会把翻过的每一页都向上游重抓一遍）；本站账号数据不受牵连。换本站账号时，各 store 监听 `auth` 的 `pageRevision` 自己清空、取消在途读取，并丢掉还在排队的写入（它们要等前一次回来才发，那时已经带上新账号的令牌了），页面由 `AppLayout` 的 KeepAlive 按新 key 整个重建。这个监听必须 `flush: "sync"`：store 是在某个页面里第一次创建的，普通 watcher 会排在那个页面之后才跑，新页面就会先看见旧数据、不再去读。

要回执的写入（绑定 e 站凭据、删除与清空阅读历史）在组合式函数里自己记「进行中」与失败提示，并显示成败，一处提示只留最近一次提交的结果。写入不接 `AbortSignal`，离开页面不取消已经发出的保存；保存有 10 秒时限，挂住的才中止，免得同一条队后面的保存、等着进度落地才读的阅读历史全跟着卡住。

## 测试要求

测试命名为 `*.test.ts`（Vitest）。重点验证可观察行为，尤其是鉴权、请求取消、缓存和导航回归。外部依赖一律换成确定性的替身，不引 mock 库。

后端的主接缝是 HTTP 边界：`test/support/app.ts` 起一份完整的应用，用 supertest 发请求，断言状态码、响应体、响应头与库里的最终状态；数据库是 Testcontainers 里的真 PostgreSQL（每个测试文件一个独立的库，应用启动时照常跑迁移），唯一的替换点是出网——`FakeOutbound` 按请求回放内存响应、记下每个请求，缓存合并、换源重试这类行为就靠数发往上游的请求来验证。时间用 Vitest 的假时钟（只假 `Date`）。应用的配置在模块导入时就读定了，需要另一套环境变量的测试放进单独的文件。次接缝是 `test/outbound.test.ts`：真实的出网实现对着本机 HTTP 服务，验证重定向、超时与断流这些主接缝测不到的网络语义。`test/fixtures/eh/` 下的 HTML 是从真实页面原样裁下来的样本，不要格式化，解析器依赖的正是原文；`test/legacy.test.ts` 里的令牌与图片地址是 Kotlin 版签出的原样结果，用来锁住兼容性，不要改。

前端测试在 `apps/web/tests/`，替身是 mock 掉 `api.ts` 或 HTTP 适配器。提交前运行相关测试，并通过根目录的 `pnpm lint`、`pnpm format:check` 与 `pnpm build`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue，界面变化附截图。

## 配置与安全

本地开发把 `apps/server/.env.example` 复制成同目录的 `.env`（已被 Git 忽略），填主密钥与 PostgreSQL 连接；容器部署全用同名的环境变量。数据库账号要有建表、改表的权限：服务启动时自动执行迁移。禁止提交凭据。
