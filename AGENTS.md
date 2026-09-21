# Repository Guidelines

## 项目结构

MyAPI 提供账号、图集浏览和节假日查询。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。Docker 构建时把前端产物放进 jar 的 `static/`，由后端统一提供 API 与静态文件。

后端是 Spring Boot + MyBatis + Kotlin（Java 25，Gradle Kotlin DSL），代码在 `backend/src/main/kotlin/io/github/kzw200015/myapi/`，按领域分包（`auth`、`eh`、`holiday`），每个领域一对或几对 Controller + Service，Controller 只做入参转换，不设门面。`eh.upstream` 是与 e 站打交道的协议层（HTTP、HTML 解析、上游失败翻译），只在 `eh` 包内使用；`web` 放统一响应体与异常翻译，`signing` 从主密钥按用途派生子密钥，根包放 `AppException` 与 `concurrently`。表结构在 `backend/src/main/resources/schema.sql`；查询 SQL 写在与 Mapper 接口同包路径的 XML 里（如 `resources/io/github/kzw200015/myapi/eh/CredentialMapper.xml`），MyBatis 按路径自动配对。测试在 `backend/src/test/`。

前端 `frontend/src/` 分三块：`app/` 是应用装配（路由、全局布局、导航目录、主题）；`features/` 下每块业务自成一体（`auth`、`eh`、`holiday`，与后端领域包对应）；`shared/` 放与业务无关的通用能力（HTTP 客户端、读取与写入排队的工具、通用组件与组合式函数）。`src/components/ui/` 与 `src/lib/utils.ts` 是 shadcn-vue 生成的源码，保持原样：已排除在 Prettier 与 oxlint 之外，清理代码或用 IDE 格式化时也别碰。静态资源在 `frontend/public/`，测试在 `frontend/tests/`。

feature 内按角色分文件：`model.ts` 是领域类型，`api.ts` 只管 HTTP 调用，`labels.ts` 一类放展示用的中文词汇，`store.ts` 放跨页面共享的状态（pinia），`composables/` 把数据和交互包成页面能直接用的形状，`components/` 与 `views/` 是界面。依赖只有一个方向：`views` → `composables` → `api`/`store` → `shared/`，页面不直接调接口，`shared/` 不反向引用 `features/` 或 `app/`。多个 feature 拼到一个界面上只在 `app/` 层发生（如设置页同时用 `auth` 与 `eh`）；feature 之间唯一允许的引用是依赖 `auth` 的会话状态，因为换账号要让各自的缓存与在途请求作废。

## 构建与测试命令

前端在 `frontend/` 下执行：

- `pnpm install --frozen-lockfile`：用 `packageManager` 指定的 pnpm 版本按锁文件安装。
- `pnpm dev`：启动 Vite，`/api` 代理到 `localhost:8000`。
- `pnpm build`（类型检查并生成 `dist/`）、`pnpm test`（Vitest 跑一次）、`pnpm lint` / `pnpm lint:fix`（oxlint）、`pnpm format` / `pnpm format:check`（Prettier）。

后端在 `backend/` 下执行：

- `./gradlew bootRun`：监听 8000，读取 `config/application.yml`。
- `./gradlew build`：编译、测试并打出可执行 jar；`./gradlew test` 只跑测试。Mapper 与接口测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行；前端两空格缩进，Kotlin 与 Mapper XML 四空格缩进、按 Kotlin 官方代码风格。注释、提交信息与文档使用简体中文。

前端格式由 Prettier 统一（无分号、双引号、120 列），import 顺序由 `@ianvs/prettier-plugin-sort-imports` 自动排，不要手工调整；lint 规则见 `frontend/.oxlintrc.json`，其中 `curly` 要求所有 `if`/`for` 带花括号。组件文件名用 PascalCase，TypeScript 标识符用 camelCase，组合式函数用 `useX`。业务组件用 `<script setup lang="ts">`，组件名从文件名推导，KeepAlive 按它匹配，需要别的名字时用 `defineOptions`；props、emits 与双向绑定用类型化的 `defineProps`、`defineEmits`、`defineModel`，不用渲染函数模拟模板。使用 `@/` 路径别名，SFC 导入显式带 `.vue`。脚本注释用 `/* */`（导出 API 用 `/** */`），模板注释用 `<!-- -->`。

危险操作的按钮用 `variant="destructive"`（红字、无底色，独立按钮再加一圈淡红描边）；代价大、不可撤销的（清空、解绑）先经 `shared/components/ConfirmDialog` 确认，只有对话框里的确认键是实心红。「回上一级」按钮在顶栏，由路由的 `meta.back` 声明，页面里不另放一份。

## 后端约定

约定大于配置：Spring Boot 默认能用的一律不写配置，`application.yml` 只留默认值不够用的几项（虚拟线程、MyBatis 按参数名映射构造器、静态资源 `no-cache`、端口），每项旁边注明原因。业务配置是各领域包里的 `@ConfigurationProperties` data class（前缀 `myapi.auth`、`myapi.eh`、`myapi.holiday`），默认值写在代码里，环境变量名按 Spring 的宽松绑定推出，完整清单见 `backend/config/application.example.yml`。主密钥只由 `signing.SigningKeys` 读取，业务类只拿派生后的子密钥。需要组装 RestClient 或派生密钥的 Bean 在所属领域的 `@Configuration` 里用 `@Bean` 造，类本身保持普通构造器，测试里直接 new。

JSON 接口一律返回 `web.ApiResponse`（`ok(data)`，只回成败的用 `ok()`）；失败抛 `AppException` 的子类，状态码只在 `web.ApiExceptionHandler` 一处映射，未预料的异常只回「服务器内部错误」，原文进日志。鉴权手写、不用 Spring Security（见 ADR-0001）：`/api` 下默认要求登录，公开接口标 `@Public`，控制器用 `@CurrentUser userId: Long` 拿当前本站账号，参数可空表示允许未登录；公开接口清单由 `ApiTest` 锁住。Web 层是 Spring MVC + 虚拟线程，按阻塞风格直写（见 ADR-0002），控制器不写 `suspend`；一个请求里要同时等两件互不依赖的事时，才用 `concurrently { async { … } }` 开协程。进程内缓存用 Caffeine，同一个 key 的并发加载只跑一次，不另加锁或 singleflight。

## 前端数据层

服务端数据的读取只写在 feature 的 `composables/` 里，页面拿到的是包好的 `loading`、`errorMessage` 与数据。数据放在哪，看它要在哪些页面之间共用：只在一个页面里用的（评论、节假日、搜索结果、阅读历史）活在组件里，单次读取用 `shared/composables/useRequest`，列表一律触底加载、用 `useCursorPages`，不做上一页下一页；页面被 KeepAlive 留着，界面状态（输入草稿、滚动位置、展开状态）和数据也就一起留着，不另设缓存。跨页面共用的放 feature 的 `store.ts`，即 `eh` 的本站账号数据（浏览偏好、搜索历史、绑定状态）与图集详情。「旧响应不算数」只由 `shared/api/request.ts` 的 `createRequest` 负责：同一路读取只认最后发起的那次，参数一变、组件销毁或 store 作废就取消在途请求，迟到的响应什么也不写，页面和 store 不再自己比对 signal 或数版本号。不自动重试，也不在窗口聚焦或网络重连时重取，失败交给用户点重试。

本站账号数据只读一次（`load()` 只在没有数据、也不在读时发请求）：本地那份才是用户正在用的，回头再读只会拿服务端的旧值盖掉他刚改的。改动先落进 store 让界面当场跟上，保存经 `createQueue` 排队依次发出（整份提交一旦乱序，后到的旧快照会把新的顶掉）。接口是整份 `PUT`，只回成败，存不上既不回滚也不提示。顺序、去重、留几条这类规则归前端，服务端只校验、落库，所以会被服务端退回的内容（如超过 200 字节的搜索词）前端要先挡掉，否则之后每次整份提交都跟着失败。代价是放弃跨设备同步（别处改了要刷新才看得见），写失败会静默不一致。偏好与搜索历史由 `EhLayout` 读齐后才创建页面组件，因为搜索页的第一次查询要用分类偏好；读不到就停在布局层让用户重试，不拿默认值放行——整份提交配上一份没读到的空值，会把服务端原有的内容冲掉，出于同样的原因，偏好没读到时 `useGalleryPreferences` 不发保存。绑定状态同样只读一次，换绑成功后直接用接口返回的新状态。

图集详情在 `useGalleryContentStore` 里按图集存一份，详情页和阅读器共用，5 分钟内再进不重取。阅读进度就是详情里的字段，不另存一份，翻页时改的就是这份详情。进度上报所有阅读器共用一条队串行发出（同一本的两次上报乱序会让进度回退），外加合并窗口，免得一本两百页发两百个请求；阅读器一个实例只读一本（`app/App.vue` 用 `readerInstanceKey` 按图集重建），所以窗口里只留一个待发页码，离开阅读页或手改地址换图集之前要主动 `flush()`，见 `useReadingProgress`。删除或清空阅读历史时，把相关图集详情里的进度一并抹成 `null`，否则重进详情会显示一个服务端已经没有的页码。

作废分两种。换绑 e 站账号时调 `useGalleryContentStore().reset()`：详情全部丢掉、`revision` 加一，评论、搜索结果、阅读历史监听它，各自从第一页重来（被 KeepAlive 留着的搜索页不会把翻过的每一页都向上游重抓一遍）；本站账号数据不受牵连。换本站账号时，各 store 监听 `auth` 的 `pageRevision` 自己清空、取消在途读取，并丢掉还在排队的写入（它们要等前一次回来才发，那时已经带上新账号的令牌了），页面由 `AppLayout` 的 KeepAlive 按新 key 整个重建。这个监听必须 `flush: "sync"`：store 是在某个页面里第一次创建的，普通 watcher 会排在那个页面之后才跑，新页面就会先看见旧数据、不再去读。

要回执的写入（绑定 e 站凭据、删除与清空阅读历史）在组合式函数里自己记「进行中」与失败提示，并显示成败，一处提示只留最近一次提交的结果。写入不接 `AbortSignal`，已经发出的保存不该被取消。

## 测试要求

后端测试命名为 `*Test.kt`（JUnit 5 + kotlin-test），前端测试命名为 `*.test.ts`（Vitest）。重点验证可观察行为，尤其是鉴权、请求取消、缓存和导航回归。外部依赖一律换掉，保证结果稳定：后端不引 mock 库，e 站经 `FakeUpstream` 换成内存响应，Mapper 换成内存实现；XML 里的 SQL 编译期不检查，所以 Mapper 与接口契约在 Testcontainers 起的真 PostgreSQL 上跑。`backend/src/test/resources/eh/` 下的 HTML 是从真实页面原样裁下来的样本，不要格式化，解析器依赖的正是原文。提交前运行相关测试，前端改动还要通过 `pnpm lint`、`pnpm format:check` 与 `pnpm build`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue，界面变化附截图。

## 配置与安全

本地开发把 `backend/config/application.example.yml` 复制成同目录的 `application.yml`（已被 Git 忽略），填主密钥与 PostgreSQL 连接；容器部署全用环境变量。表由人工执行 `backend/src/main/resources/schema.sql` 创建，服务启动时不碰 DDL。禁止提交凭据。
