# Repository Guidelines

## 项目结构与模块划分

MyAPI 提供账号、图集浏览和节假日查询。`backend/cmd/myapi/` 存放 Go 入口与 Wire 依赖注入代码；`backend/internal/` 包含业务模块（`auth`、`eh`、`holiday`）、HTTP 基础设施、配置和 PostgreSQL 访问代码。HTTP Handler 与业务 Service 保持分离。表结构统一位于 `backend/internal/store/schema.sql`，查询 SQL 及 sqlc 生成代码位于各业务模块的 `store/` 子目录，由 `backend/sqlc.yaml` 统一配置。

`frontend/src/` 按业务领域分三块：`app/` 是应用装配（路由、全局布局、导航目录、主题），`features/` 下每块业务自成一体（`auth`、`eh`、`holiday`，与 `backend/internal/` 的模块一一对应），`shared/` 放与业务无关的通用能力（HTTP 客户端、查询缓存、通用组件与组合式函数）。`src/components/ui/` 与 `src/lib/utils.ts` 是 shadcn-vue 的生成位置，保持原样。静态资源放在 `frontend/public/`，前端测试放在 `frontend/tests/`，Go 测试与实现文件同目录。领域术语见 `CONTEXT.md`，辅助工作流见 `docs/agents/`。Docker 镜像由 Go 服务统一提供 API 和前端静态文件。

一块 feature 内部按角色分文件：`model.ts` 是领域类型，`api.ts` 只管 HTTP 调用，`keys.ts` 放查询键与新鲜期，`labels.ts` 一类放展示用的中文词汇，`store.ts` 只收留查询缓存管不住的共享状态（目前只有 `auth` 的会话），`composables/` 把数据和交互包成页面能直接用的形状，`components/` 与 `views/` 是界面。依赖方向只有一条：`views` → `composables` → `api`/`store` → `shared/`，页面不直接调接口、也不直接写 `useQuery`。把多个 feature 拼到一个界面上只发生在 `app/` 层（如设置页同时用到 `auth` 与 `eh`）；feature 之间唯一允许的引用是依赖 `auth` 的会话状态，因为换账号要让各自的缓存与在途请求作废。`shared/` 不得反向引用 `features/` 或 `app/`。

## 构建、测试与本地开发

以下命令均从仓库根目录执行，按需选择：

- `cd frontend && pnpm install --frozen-lockfile`：使用项目指定的 pnpm 版本，按锁文件安装依赖。
- `cd frontend && pnpm dev`：启动 Vite，`/api` 请求代理到 `localhost:8000`。
- `cd frontend && pnpm build`：执行 TypeScript 类型检查并生成 `dist/`。
- `cd frontend && pnpm test`：运行一次 Vitest 测试。
- `cd frontend && pnpm lint`：运行 oxlint 检查，`pnpm lint:fix` 自动修复。
- `cd frontend && pnpm format`：用 Prettier 格式化，`pnpm format:check` 只校验。
- `cd backend && go run ./cmd/myapi`：启动后端服务。
- `cd backend && go build ./cmd/myapi`：编译后端。
- `cd backend && go test ./...`：运行后端测试。
- `cd backend && go vet ./...`：检查常见 Go 代码问题。

## 代码风格与命名约定

遵循 `.editorconfig`：UTF-8 编码、LF 换行、文件末尾换行；前端使用两空格缩进，Go 使用制表符并通过 `gofmt` 格式化。组件文件名使用 PascalCase，TypeScript 标识符使用 camelCase，组合式函数使用 `useX` 命名。

前端格式由 Prettier 统一（无分号、双引号、120 列），import 顺序由 `@ianvs/prettier-plugin-sort-imports` 自动排序（三方依赖 → `@/` 内部模块），不要手工调整；lint 规则见 `frontend/.oxlintrc.json`，其中 `curly` 要求所有 `if`/`for` 使用花括号。`src/components/ui/` 属于 shadcn-vue 生成源码，已在 `.prettierignore` 与 oxlint 的 `ignorePatterns` 中排除，清理代码时同样保留。

业务组件使用 Vue SFC 与 `<script setup lang="ts">`，组件名默认从 PascalCase 文件名推导，KeepAlive 按该名称匹配；需要不同名称时使用 `defineOptions` 显式声明。模板使用 `v-if`、`v-for`、`v-model`、`@事件` 和事件修饰符，props、emits 与双向绑定分别使用类型化的 `defineProps`、`defineEmits`、`defineModel`；不要用渲染函数模拟模板。可复用的业务状态与副作用放在组合式函数中。前端使用 `@/` 路径别名，SFC 导入显式带 `.vue` 后缀，页面经所属 feature 的组合式函数访问后端。脚本注释使用 `/* */`（导出 API 用 `/** */`），模板注释使用 `<!-- -->`；注释、提交信息和文档使用简体中文。

## 前端数据层

服务端数据的读取统一走 `@tanstack/vue-query`，且只写在 feature 的 `composables/` 里，页面拿到的是已经包好的 `loading`、`errorMessage` 与数据本身。查询键定义在各 feature 的 `keys.ts`（如 `ehKeys`），`eh` 的键只有 `content` 这一段是成片的（受 e 站凭据影响的内容：图集、评论、搜索结果、阅读历史），换绑 e 站账号时整片 `resetQueries` 的就是它（不用 `invalidateQueries`：被 KeepAlive 留着的搜索页会把翻过的每一页都向上游重抓一遍，reset 只取第一页）；本站账号数据（浏览偏好、绑定状态、搜索历史）各自平级，不受这次失效牵连。「旧响应不算数」由查询键承担，页面不再自己数版本号或比对 signal。全局缓存策略在 `src/shared/api/queryClient.ts`：不自动重试、不在窗口聚焦时重取，失败交给用户点重试；各业务自己的新鲜期（如 `CONTENT_STALE_TIME`）跟着所属 feature 走。

账号级数据（浏览偏好、搜索历史）读一次就不再重取（`staleTime: Infinity`）：本地那份才是用户正在用的，回头再读只会拿服务端的旧值盖掉他刚改的。写入用 `useMutation` 的乐观更新——`onMutate` 先把新值落进缓存让界面当场跟上，保存排在同一条 `scope` 上依次发出（整份提交一旦乱序，后到的旧快照会把新的顶掉）。存不上既不回滚也不提示；接口只回成败，不回存下来的那一份——本地已经是用户要的样子，没有东西需要写回。对应的接口是整份 `PUT`：顺序、去重、留几条这类规则归前端，服务端只校验、落库，所以会被服务端退回的内容（如超过 200 字节的搜索词）前端自己先挡掉，否则之后每次整份提交都跟着失败。代价是放弃跨设备同步（别处改了要刷新才看得见），以及写失败会静默不一致。这两份数据由 `EhLayout` 等齐后才创建页面组件——搜索页开出的第一次查询要用分类偏好。读不到就停在布局层让用户重试，不拿默认值放行：整份提交配上一份没读到的空值，下一次改动就会把服务端原有的内容冲掉；出于同样的原因，偏好没读到时 `useGalleryPreferences` 不发保存。

阅读进度不单独存一份：它本来就是图集详情接口返回的字段，翻页时改的就是 `ehKeys.gallery` 那份缓存，详情页读的也是它。写入同样是乐观更新加 `scope` 串行（同一本的两次上报乱序会让进度回退），额外加了合并窗口：翻页是连着来的，一本两百页不该是两百个请求。阅读器一个实例只读一本（`app/App.vue` 用 `readerInstanceKey` 按图集重建），所以窗口里只留一个待发页码；离开阅读页、或手改地址换图集之前要主动 `flush()` 一次，否则最后翻的几页就留在窗口里了，见 `useReadingProgress`。删除或清空阅读历史时，要把相关图集详情缓存里的进度一并抹成 `null`，否则重进详情会显示一个服务端已经没有的页码。

要回执的写入（e 站凭据绑定、阅读历史的删除与清空）仍用 `useMutation` 并显示成败——它们的结果本身就是用户要的信息。写入不接 `AbortSignal`，已经发出的保存不该被取消。同一页面上只有一处失败提示时，发起新写入前先 `reset()` 其余 mutation。

`KeepAlive` 只负责留住界面状态（输入草稿、滚动位置、展开状态），数据的新鲜与跨页面共享由查询缓存负责；换账号时 `app/App.vue` 清空整个缓存。列表分页一律是触底加载的 `useInfiniteQuery`，不做上一页下一页。

## 测试要求

Go 测试命名为 `*_test.go`，Vitest 测试命名为 `*.test.ts`。重点验证可观察行为，尤其是鉴权、请求取消、缓存和导航回归。模拟外部服务，保证测试结果稳定。项目未配置数值化覆盖率门槛；提交评审前运行相关测试，前端改动还需通过 `pnpm lint`、`pnpm format:check` 与 `pnpm build`。

## 提交与 Pull Request 规范

沿用 Git 历史中的 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，使用简体中文概述改动，每次提交聚焦一个目的。PR 应说明解决的问题、改动后的行为和验证结果；关联相关 issue，界面变化附截图。

## 配置与 Agent 执行要求

将 `backend/config.example.yml` 复制为已被 Git 忽略的 `backend/config.yml`，配置密钥和 PostgreSQL 连接。手动执行 `backend/internal/store/schema.sql` 建表，服务启动时不会自动创建表。禁止提交凭据。

安装依赖和构建时，关闭沙箱执行对应命令。
