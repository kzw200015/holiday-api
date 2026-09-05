# Repository Guidelines

## 项目结构与模块划分

MyAPI 提供账号、图集浏览和节假日查询。`backend/cmd/myapi/` 存放 Go 入口与 Wire 依赖注入代码；`backend/internal/` 包含业务模块（`auth`、`eh`、`holiday`）、HTTP 基础设施、配置和 PostgreSQL 访问代码。HTTP Handler 与业务 Service 保持分离。SQL 源文件及 sqlc 生成代码位于 `backend/internal/store/`。

`frontend/src/` 存放 Vue 3/TypeScript 页面、布局、组件、组合式函数、API 封装和状态管理代码。静态资源放在 `frontend/public/`，前端测试放在 `frontend/tests/`，Go 测试与实现文件同目录。领域术语见 `CONTEXT.md`，辅助工作流见 `docs/agents/`。Docker 镜像由 Go 服务统一提供 API 和前端静态文件。

## 构建、测试与本地开发

以下命令均从仓库根目录执行，按需选择：

- `cd frontend && pnpm install --frozen-lockfile`：使用项目指定的 pnpm 版本，按锁文件安装依赖。
- `cd frontend && pnpm dev`：启动 Vite，`/api` 请求代理到 `localhost:8000`。
- `cd frontend && pnpm build`：执行 TypeScript 类型检查并生成 `dist/`。
- `cd frontend && pnpm test`：运行一次 Vitest 测试。
- `cd backend && go run ./cmd/myapi`：启动后端服务。
- `cd backend && go build ./cmd/myapi`：编译后端。
- `cd backend && go test ./...`：运行后端测试。
- `cd backend && go vet ./...`：检查常见 Go 代码问题。

## 代码风格与命名约定

遵循 `.editorconfig`：UTF-8 编码、LF 换行、文件末尾换行；前端使用两空格缩进，Go 使用制表符并通过 `gofmt` 格式化。组件文件名使用 PascalCase，TypeScript 标识符使用 camelCase，组合式函数使用 `useX` 命名。

业务组件使用 TSX 和 `defineComponent`；清理代码时保留 `components/ui/` 中的生成源码。前端使用 `@/` 路径别名，通过 API 封装访问后端。目前未配置独立的前端 lint 脚本。注释、提交信息和文档使用简体中文。

## 测试要求

Go 测试命名为 `*_test.go`，Vitest 测试命名为 `*.test.ts`。重点验证可观察行为，尤其是鉴权、请求取消、缓存和导航回归。模拟外部服务，保证测试结果稳定。项目未配置数值化覆盖率门槛；提交评审前运行相关测试，前端改动还需通过构建检查。

## 提交与 Pull Request 规范

沿用 Git 历史中的 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，使用简体中文概述改动，每次提交聚焦一个目的。PR 应说明解决的问题、改动后的行为和验证结果；关联相关 issue，界面变化附截图。

## 配置与 Agent 执行要求

将 `backend/config.example.yml` 复制为已被 Git 忽略的 `backend/config.yml`，配置密钥和 PostgreSQL 连接。手动执行 `backend/internal/store/schema.sql` 建表，服务启动时不会自动创建表。禁止提交凭据。

安装依赖和构建时，关闭沙箱执行对应命令。
