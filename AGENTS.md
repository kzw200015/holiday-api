# Repository Guidelines

## Project Structure & Module Organization

本仓库是一个 Go + Vue 的单仓（monorepo）。

- `backend/`：基于 Gin 的 API 服务。
- `backend/internal/holiday`：节假日领域逻辑与上游数据拉取。
- `backend/internal/httpapi`：HTTP 处理器、响应模型、前端静态资源托管。
- `backend/internal/httpapi/webdist`：前端构建产物，编译后嵌入后端二进制。
- `frontend/`：Vue 3 + TypeScript + Vite 应用。
- `frontend/src/api|views|components|layouts|router|stores|styles`：API 封装、页面、组件、布局、路由、状态、样式。
- `Dockerfile`：前后端多阶段构建脚本。

不要手动修改 `frontend/dist/` 或 `backend/internal/httpapi/webdist/`，应通过构建重新生成。

## Build, Test, and Development Commands

- `cd frontend && pnpm install`：安装前端依赖。
- `cd frontend && pnpm dev`：启动 Vite 开发服务（`/api` 代理到 `http://localhost:8000`）。
- `cd backend && go run .`：启动后端服务，监听 `:8000`。
- `cd frontend && pnpm build`：执行前端类型检查并生成生产构建产物。
- `rm -rf backend/internal/httpapi/webdist/* && cp -R frontend/dist/* backend/internal/httpapi/webdist/`
  ：将前端构建结果同步到后端嵌入目录。
- `cd backend && go build ./...`：编译后端所有包。
- `docker build -t myapi .`：构建完整生产镜像。

## Coding Style & Naming Conventions

- 遵循 `.editorconfig`：UTF-8、LF、去除行尾空白、默认 4 空格缩进。
- Go 代码必须经过 `gofmt` 格式化。
- 前端启用 TypeScript 严格模式，`frontend/src` 目录统一使用 `@/` 别名导入。
- 命名约定：Go 导出标识符与 Vue 组件使用 `PascalCase`，函数和变量使用 `camelCase`。
- 接口响应结构保持一致：`ApiResponse<T> { code, data, msg }`。

## Testing Guidelines

- 当前仓库尚未配置专用前端测试运行器。
- 后端测试命令：`cd backend && go test ./...`。
- 新增后端测试请采用 `*_test.go`，并放在对应包目录下。
- 若新增前端测试，建议与源文件同目录放置，命名为 `*.test.ts` 或 `*.test.tsx`。
- 涉及 API 变更时，至少覆盖成功路径和 `date` 参数非法场景。

## Commit & Pull Request Guidelines

- 提交信息遵循仓库现有 Conventional Commit 风格，例如：`feat(frontend): ...`、`fix: ...`、`refactor(backend): ...`。
- 推荐类型：`feat`、`fix`、`refactor`、`chore`、`style`。
- 每次提交尽量聚焦单一模块（`backend` 或 `frontend`）和单一目的。
- PR 需包含：
    - 变更行为的简要说明；
    - 已执行的验证步骤与命令；
    - 涉及 UI 变更时附截图；
    - 涉及接口行为变化时补充 API 契约说明。
