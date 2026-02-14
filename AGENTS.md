# AGENTS Guide

本文件面向在本仓库执行任务的 Agent（Cursor / Copilot / CLI Agent 等）。
目标：减少试错，统一构建/测试/风格约定，避免引入无意义的兼容与兜底。

## 0. 规则文件（Cursor / Copilot）

本仓库未发现以下规则文件（如后续加入，请同步更新本节）：

- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

## 1. 仓库概览

单仓，包含前端与后端两套业务代码：

- `frontend/`：Vue 3 + TypeScript + TSX + Vite + Element Plus + Tailwind。
- `backend-java/`：Spring Boot 4 + MyBatis-Plus，Gradle，Java 21。
- `Dockerfile`：多阶段构建；先构建前端，再将 `frontend/dist` 打进后端静态资源并 `bootJar`。

常用目录：

- `frontend/src/api`：前端 API 封装（Axios + 统一响应结构）。
- `frontend/src/views`：页面级 TSX 组件。
- `frontend/src/router`：路由。
- `backend-java/src/main/java/...`：Java 主代码。
- `backend-java/src/main/resources/mapper`：MyBatis XML。

关键约定：

- 后端端口：`8000`（见 `backend-java/src/main/resources/application.yml`）。
- 前端开发代理：Vite 将 `/api` 代理到 `http://localhost:8000`（见 `frontend/vite.config.ts`）。

## 2. 构建 / 运行 / 质量门禁命令

以下命令默认在仓库根目录执行。

### 2.1 前端（frontend）

- 安装依赖：`cd frontend && pnpm install`
- 本地开发：`cd frontend && pnpm dev`
- 生产构建（含类型检查）：`cd frontend && pnpm build`
- 本地预览：`cd frontend && pnpm preview`
- 仅类型检查：`cd frontend && pnpm exec vue-tsc -b --pretty false`

说明：当前未配置 ESLint/Stylelint/Prettier 脚本；`pnpm build`（`vue-tsc -b` + `vite build`）是主要质量门禁。

### 2.2 Java 后端（backend-java）

- 启动服务：`cd backend-java && ./gradlew bootRun`
- 编译 + 单测：`cd backend-java && ./gradlew build`
- 仅单测：`cd backend-java && ./gradlew test`
- 综合校验：`cd backend-java && ./gradlew check`
- 打包可运行 Jar：`cd backend-java && ./gradlew bootJar`

说明：当前可能缺少测试类，但 `test` 任务与 JUnit Platform 已配置（见 `backend-java/build.gradle`）。

### 2.3 Docker（全量镜像）

- 构建镜像：`docker build -t myapi .`

镜像逻辑：前端构建产物会被复制到后端 `src/main/resources/static`，最终暴露端口 `8000`（见 `Dockerfile`）。

## 3. 单测（尤其单个测试）运行方式

### 3.1 Java（Gradle + JUnit Platform）

- 跑某个测试类：
  `cd backend-java && ./gradlew test --tests 'com.github.kzw200015.myapi.SomeTest'`
- 跑某个测试方法：
  `cd backend-java && ./gradlew test --tests 'com.github.kzw200015.myapi.SomeTest.testMethod'`

### 3.2 前端测试

- 当前未接入专用测试运行器（无 `test` script）。
- 如需新增测试：优先 `*.test.ts` / `*.test.tsx`，并补齐可执行脚本（例如 `pnpm test`）。

## 4. 构建产物与生成代码约束

- 不要手改 `frontend/dist/`，必须由 `pnpm build` 生成。
- 不要手改 `backend-java/build/`。
- 变更应尽量最小化；避免与需求无关的格式化/重排。

## 5. 格式化与基础风格（以项目现状为准）

- `.editorconfig`：UTF-8、LF、去尾空白、文件末尾换行。
- 默认缩进 4 空格；前端由 `frontend/.editorconfig` 覆盖为 2 空格。
- Markdown 允许尾部空白（便于表格/换行）。
- 前端代码风格：普遍使用双引号、无分号、尾逗号（以现有文件为准，避免全局“统一格式化”）。

## 6. TypeScript / TSX 约定（frontend）

### 6.1 导入与路径

- 导入分组：第三方 -> `@/` 别名 -> 相对路径。
- `@` 指向 `frontend/src`（见 `frontend/vite.config.ts` 与 `tsconfig` paths）。
- 保持现有习惯：别名导入通常带扩展名（如 `@/api/httpClient.ts`、`.../FooCard.tsx`）。
- 类型与值分离：优先 `import type { X } from "..."`。

### 6.2 类型与数据模型

- TS 严格模式开启：`strict: true`（见 `frontend/tsconfig.app.json`）。
- 禁止 `any`（除非有充分理由且能被审阅者接受）。
- 禁止非空断言：不使用 `value!`。
- API 响应统一结构：`ApiResponse<T> = { code, data, msg }`（见 `frontend/src/api/httpClient.ts`）。
- 常量枚举用 `as const` + 联合类型（见 `frontend/src/api/codexApi.ts`）。

### 6.3 UI 与组件写法

- Vue TSX：使用 `defineComponent({ name, setup })`（见 `frontend/src/views/*.tsx`）。
- TSX 中使用 `class=`（不是 `className`）。
- Element Plus 事件与 v-model：遵循现有写法（如 `v-model={ref.value}`）。
- Tailwind：项目已启用（见 `frontend/tailwind.config.cjs`），字体基线为中文常用字体族。

### 6.4 错误处理

- 统一在 Axios 响应拦截器提示错误：`ElMessage.error`（见 `frontend/src/api/httpClient.ts`）。
- 页面层按需处理加载/空态；不要到处复制粘贴“吞错兜底”。

## 7. Java 约定（backend-java）

### 7.1 版本与依赖

- Java Toolchain：21（见 `backend-java/build.gradle`）。
- Spring Boot：4.x；MyBatis-Plus Starter for Spring Boot 4。

### 7.2 包结构、命名与导入

- 包名全小写分层：`...codex.service` / `...holiday.controller`。
- 类/record 使用 `PascalCase`；字段/方法使用 `camelCase`。
- 导入分组：JDK -> 第三方 -> `com.github.kzw200015.myapi...`；避免通配符导入。
- 依赖注入：优先构造注入，当前主要用 `@RequiredArgsConstructor`。

### 7.3 API 结构与校验

- Controller 返回统一包装：`ApiResponse<T>`（见 `backend-java/src/main/java/.../common/model/ApiResponse.java`）。
- 请求体优先 `record + jakarta.validation` 注解（见 `.../UpdateAccountRequest.java`、`.../UpdatePromptConfigRequest.java`）。
- Controller 上启用参数校验：`@Validated`；方法参数用 `@Min/@Max/@NotNull/@Valid`。

### 7.4 错误处理

- 不在 Controller 内分散 `try/catch`；业务异常直接抛出。
- 统一由 `GlobalExceptionHandler` 转成 `{code, data, msg}`（见 `backend-java/src/main/java/.../common/exception/GlobalExceptionHandler.java`）。
- 参数不合法：优先用校验注解；少量场景可抛 `IllegalArgumentException`（会被转成 400）。

## 8. 变更原则（给自动化 Agent 的硬约束）

- 禁止编写“历史数据兼容/旧字段兜底”逻辑，除非需求明确要求。
- 禁止添加无意义的防御性编程与数据归一化；充分信任上游输入（以现有接口契约为准）。
- 只做需求要求的改动；避免顺手重构、批量格式化、无关重命名。

## 9. 安全与配置

- 不要新增或扩散敏感信息（账号、密码、token、私钥等）到代码、日志、提交信息。
- 如需调整运行环境配置，优先通过文档说明或示例文件，而不是硬编码到业务逻辑里。

## 10. 建议的本地验证清单（按改动范围选择）

- 仅前端改动：`cd frontend && pnpm build`
- 仅后端改动：`cd backend-java && ./gradlew build`
- 前后端联动：前端 `pnpm dev` + 后端 `./gradlew bootRun`，确认 `/api/*` 代理链路正常
