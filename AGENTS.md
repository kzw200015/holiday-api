# AGENTS Guide

本文件面向在本仓库执行任务的 Agent（Cursor、Copilot、CLI Agent 等）。
目标是减少试错，统一构建/测试/风格约定。

## 1. 仓库概览

本仓库是多模块单仓，包含三套代码：

- `frontend/`：Vue 3 + TypeScript + TSX + Vite + Element Plus + Tailwind。
- `backend/`：Go + Gin + Ent 的 API 服务（含嵌入式前端静态资源逻辑）。
- `backend-java/`：Spring Boot 4 + MyBatis-Plus 的 API 服务（Docker 默认使用该后端）。
- `Dockerfile`：多阶段构建，先构建前端，再打包 `backend-java`。

重点目录：

- `frontend/src/api`：前端 API 封装。
- `frontend/src/views`：页面级 TSX 组件。
- `frontend/src/router`：路由定义。
- `backend/internal/httpapi`：Go HTTP 路由/响应模型/静态资源托管。
- `backend/internal/holiday`：节假日领域逻辑。
- `backend/internal/codexproxy`：Codex 代理与调用日志。
- `backend/internal/ent/schema`：Ent schema（源），其他 ent 文件多数为生成物。
- `backend-java/src/main/java/...`：Java 后端主代码。
- `backend-java/src/main/resources/mapper`：MyBatis XML。

## 2. 构建、运行、检查命令

以下命令默认在仓库根目录执行。

### 2.1 前端（frontend）

- 安装依赖：`cd frontend && pnpm install`
- 本地开发：`cd frontend && pnpm dev`
- 生产构建（含类型检查）：`cd frontend && pnpm build`
- 本地预览：`cd frontend && pnpm preview`
- 仅类型检查：`cd frontend && pnpm exec vue-tsc -b --pretty false`

说明：当前未配置 ESLint/Stylelint 脚本，`pnpm build` 是前端主要质量门禁。

### 2.2 Go 后端（backend）

- 启动服务：`cd backend && go run .`
- 编译全部包：`cd backend && go build ./...`
- 运行全部测试：`cd backend && go test ./...`
- 静态检查：`cd backend && go vet ./...`
- 格式化：`cd backend && gofmt -w .`

### 2.3 Java 后端（backend-java）

- 启动服务：`cd backend-java && ./gradlew bootRun`
- 编译：`cd backend-java && ./gradlew build`
- 测试：`cd backend-java && ./gradlew test`
- 综合校验：`cd backend-java && ./gradlew check`
- 打包可运行 Jar：`cd backend-java && ./gradlew bootJar`

说明：当前 `backend-java` 尚无测试类，但测试任务可正常执行。

### 2.4 全量镜像

- 构建镜像：`docker build -t myapi .`

## 3. 单测（尤其单个测试）运行方式

### 3.1 Go 单测

- 跑某个包：`cd backend && go test ./internal/codexproxy`
- 跑某个测试函数：
  `cd backend && go test ./internal/codexproxy -run '^TestStickySessionBindingCRUD$' -count=1`
- 跑名称匹配的一组测试：
  `cd backend && go test ./... -run 'Sticky|Usage' -count=1`

备注：当前已存在测试文件 `backend/internal/codexproxy/service_test.go`。

### 3.2 Java 单测（Gradle）

- 跑某个测试类：
  `cd backend-java && ./gradlew test --tests 'com.github.kzw200015.myapi.SomeTest'`
- 跑某个测试方法：
  `cd backend-java && ./gradlew test --tests 'com.github.kzw200015.myapi.SomeTest.testMethod'`

### 3.3 前端测试

- 当前未接入专用测试运行器（无 `test` script）。
- 若后续新增测试，建议命名 `*.test.ts` / `*.test.tsx`，并在 `package.json` 增加可直接调用的脚本。

## 4. 构建产物与生成代码约束

- 不要手改 `frontend/dist/`，应通过 `pnpm build` 生成。
- 不要手改 `backend/internal/httpapi/webdist/`，应由前端构建产物同步生成。
- Go Ent 代码生成命令：`cd backend && go generate ./internal/ent`
- 修改 Ent 模型时优先改 `backend/internal/ent/schema/*.go`，再重新生成。
- 不要手改 `backend-java/build/` 目录内容。

前端产物同步到 Go 嵌入目录（仅在使用 Go 后端托管前端时）：

- `rm -rf backend/internal/httpapi/webdist/* && cp -R frontend/dist/* backend/internal/httpapi/webdist/`

## 5. 通用代码风格

- 遵循根目录 `.editorconfig`：UTF-8、LF、去尾空白、默认 4 空格。
- `frontend/.editorconfig` 覆盖前端缩进为 2 空格。
- Markdown 允许尾部空白（见 `.editorconfig`）。
- 保持最小改动原则：不要在无关文件做纯格式化改动。

## 6. 导入与依赖风格

### 6.1 Go

- 导入分组遵循：标准库 -> 本项目包 -> 第三方包（组间空行）。
- 保持 `goimports/gofmt` 兼容格式。
- 不引入未使用导入。

### 6.2 TypeScript / TSX

- 导入分组遵循：框架/第三方 -> `@/` 别名模块 -> 相对路径模块。
- `frontend/src` 下优先使用 `@/`，不要回退到复杂相对路径。
- 类型导入与值导入分离（如 `import type { Foo } ...`）。

### 6.3 Java

- 导入分组遵循：JDK -> 第三方 -> `com.github.kzw200015.myapi...`。
- 避免通配符导入。
- 优先使用构造注入（当前项目以 `@RequiredArgsConstructor` 为主）。

## 7. 类型、命名与结构约定

### 7.1 命名

- Go 导出符号/Java 类/TSX 组件使用 `PascalCase`。
- Go/TS 变量与函数使用 `camelCase`。
- Java 包名全小写分层（`...codex.service` / `...holiday.controller`）。

### 7.2 类型

- 前端启用严格 TS（`strict: true`），禁止随意引入 `any`。
- 禁止使用 TypeScript 非空断言（`!`）。
- 前端 API 返回类型与后端结构保持一致：`ApiResponse<T> = { code, data, msg }`。
- Java 请求体优先使用 `record + jakarta.validation`。
- Go 端统一使用强类型结构体，避免无意义 `map[string]any` 扩散。

## 8. 错误处理约定

- Go HTTP 层统一返回 `ApiResponse`，优先复用 `Ok/BadRequest/NotFound/InternalServerError`。
- Go 服务层返回 `error`，由 handler 负责映射 HTTP 状态码。
- Java 业务异常抛出后由 `GlobalExceptionHandler` 统一转换，不在 Controller 内分散 try/catch。
- 前端统一通过 `HttpClient` 响应拦截器提示错误（`ElMessage.error`），页面层按需兜底 UI 状态。

## 9. 测试与变更验证要求

- 涉及 API 变更时，至少覆盖：成功路径 + 非法参数路径（特别是 `date` 参数）。
- Go 新增测试使用 `*_test.go`，与被测包同目录。
- Java 新增测试放在 `backend-java/src/test/java/...`。
- 前端若新增测试，优先靠近源文件放置。

## 10. Cursor / Copilot 规则扫描结果

- 未发现 `.cursor/rules/`、`.cursorrules`、`.github/copilot-instructions.md`。
- 当前仓库无额外 Cursor/Copilot 专用规则文件。
