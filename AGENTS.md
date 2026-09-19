# Repository Guidelines

## 项目结构与模块划分

MyAPI 提供账号、图集浏览和节假日查询。`backend/cmd/myapi/` 存放 Go 入口与 Wire 依赖注入代码；`backend/internal/` 包含业务模块（`auth`、`eh`、`holiday`）、HTTP 基础设施、配置和 PostgreSQL 访问代码。HTTP Handler 与业务 Service 保持分离。表结构统一位于 `backend/internal/store/schema.sql`，查询 SQL 及 sqlc 生成代码位于各业务模块的 `store/` 子目录，由 `backend/sqlc.yaml` 统一配置。

`frontend/src/` 存放 Vue 3/TypeScript 页面、布局、组件、组合式函数、API 封装和状态管理代码。静态资源放在 `frontend/public/`，前端测试放在 `frontend/tests/`，Go 测试与实现文件同目录。领域术语见 `CONTEXT.md`，辅助工作流见 `docs/agents/`。Docker 镜像由 Go 服务统一提供 API 和前端静态文件。

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

业务组件使用 Vue SFC 与 `<script setup lang="ts">`，组件名默认从 PascalCase 文件名推导，KeepAlive 按该名称匹配；需要不同名称时使用 `defineOptions` 显式声明。模板使用 `v-if`、`v-for`、`v-model`、`@事件` 和事件修饰符，props、emits 与双向绑定分别使用类型化的 `defineProps`、`defineEmits`、`defineModel`；不要用渲染函数模拟模板。可复用的业务状态与副作用放在组合式函数中。前端使用 `@/` 路径别名，SFC 导入显式带 `.vue` 后缀，通过 API 封装访问后端。脚本注释使用 `/* */`（导出 API 用 `/** */`），模板注释使用 `<!-- -->`；注释、提交信息和文档使用简体中文。

## 前端数据层

服务端数据的读取统一走 `@tanstack/vue-query`。查询键定义在 `src/api/` 下（如 `ehKeys`），`eh` 的键按 `content`（受 e 站凭据影响的内容：图集、评论、搜索结果、阅读历史）和 `account`（本站账号数据：浏览偏好、绑定状态、搜索历史）分开，换绑 e 站账号只失效前者。「旧响应不算数」由查询键承担，页面不再自己数版本号或比对 signal。缓存策略集中在 `src/api/queryClient.ts`：不自动重试、不在窗口聚焦时重取，失败交给用户点重试。

写入用 `useMutation`，成功后按需 `setQueryData` 或失效对应键；写入不接 `AbortSignal`，已经发出的保存不该被取消。同一页面上只有一处失败提示时，发起新写入前先 `reset()` 其余 mutation，让提示跟着最近一次操作走。只有「接口返回整份数据、调用方整份替换」的场景（目前是搜索历史）才需要 `EhStore` 里的串行队列保证提交顺序；阅读进度另有本地共享状态，也在该 Store 内。

`KeepAlive` 只负责留住界面状态（输入草稿、滚动位置、展开状态），数据的新鲜与跨页面共享由查询缓存负责；换账号时 `App.vue` 清空整个缓存。列表分页一律是触底加载的 `useInfiniteQuery`，不做上一页下一页。

## 测试要求

Go 测试命名为 `*_test.go`，Vitest 测试命名为 `*.test.ts`。重点验证可观察行为，尤其是鉴权、请求取消、缓存和导航回归。模拟外部服务，保证测试结果稳定。项目未配置数值化覆盖率门槛；提交评审前运行相关测试，前端改动还需通过 `pnpm lint`、`pnpm format:check` 与 `pnpm build`。

## 提交与 Pull Request 规范

沿用 Git 历史中的 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，使用简体中文概述改动，每次提交聚焦一个目的。PR 应说明解决的问题、改动后的行为和验证结果；关联相关 issue，界面变化附截图。

## 配置与 Agent 执行要求

将 `backend/config.example.yml` 复制为已被 Git 忽略的 `backend/config.yml`，配置密钥和 PostgreSQL 连接。手动执行 `backend/internal/store/schema.sql` 建表，服务启动时不会自动创建表。禁止提交凭据。

安装依赖和构建时，关闭沙箱执行对应命令。
