# Java API 仓库：Agent 开发指南

本文件面向在本仓库内自动编程/改代码的 agent（例如 OpenCode、Cursor、Copilot Chat）。目标是：快速跑起来、少踩坑、少做无关改动。

## 代码库结构

- 后端：Spring Boot 4.x（`pom.xml`，Java 21），端口默认 `8000`（见 `src/main/resources/application.yaml`）
- 前端：Vite + React 19 + TypeScript（目录 `ui/`），dev server 通过代理把 `/api` 转发到 `http://localhost:8000`（见 `ui/vite.config.ts`）
- 数据库：PostgreSQL（见 `application.yaml` 的 datasource 配置）；ORM 为 MyBatis-Plus

## 常用命令（后端 / Maven）

优先使用 Maven Wrapper：`./mvnw`（Windows 用 `mvnw.cmd`）。

- 安装依赖/编译：`./mvnw -DskipTests compile`
- 全量构建（不跑测试）：`./mvnw -DskipTests package`
- 全量测试：`./mvnw test`
- 更接近 CI 的校验（如有插件会在此阶段执行）：`./mvnw verify`
- 清理构建产物：`./mvnw clean`
- 本地运行：`./mvnw spring-boot:run`
- 运行打包后的 jar：`java -jar target/java-api-0.0.1-SNAPSHOT.jar`

### 只跑单个测试（最重要）

测试框架：JUnit 5（见 `src/test/java/...`）。

- 跑单个测试类：
  - `./mvnw -Dtest=JavaApiApplicationTests test`
- 跑单个测试方法：
  - `./mvnw -Dtest=JavaApiApplicationTests#contextLoads test`
- 跑多个类（逗号分隔）：
  - `./mvnw -Dtest=FooTest,BarTest test`
- 按通配符匹配（Surefire 语义）：
  - `./mvnw -Dtest=*Holiday* test`

备注：当前 `pom.xml` 未集成 Checkstyle/Spotless 等“格式化/静态检查”插件；在后端侧，`mvn test/verify` 主要覆盖编译与测试。

## 常用命令（前端 / ui）

包管理器：`pnpm`（有 `ui/pnpm-lock.yaml`）。

- 安装依赖：`pnpm -C ui install`
- 开发启动：`pnpm -C ui dev`
- 构建（包含 typecheck + Vite build）：`pnpm -C ui build`
- 本地预览构建产物：`pnpm -C ui preview`

### Lint/Test 现状

- `ui/package.json` 当前没有 `lint` / `test` 脚本。
- 类型/静态检查主要依赖 TypeScript（`strict: true`、`noUnusedLocals` 等，见 `ui/tsconfig*.json`）。
- 如需仅做类型检查，可用：`pnpm -C ui exec tsc -b`（与 `build` 的第一步一致）。

## Docker

- 构建镜像：`docker build -t java-api .`
- 运行容器（注意：应用实际端口取决于 `server.port`，当前为 8000）：
  - `docker run --rm -p 8000:8000 java-api`

备注：`Dockerfile` 的 `EXPOSE 8080` 只是元数据，不会自动改应用端口；以 `application.yaml` 为准。

## 仓库内规则文件

- 未发现 Cursor 规则：`.cursor/rules/` 或 `.cursorrules`
- 未发现 Copilot 规则：`.github/copilot-instructions.md`

如果后续新增这些文件，请把关键约定同步到本文件并保持一致。

## 代码风格与约定（后端 / Java）

### 基本原则

- 只做需求相关改动；避免顺手“全文件格式化/整理 import”导致大 diff
- 以现有代码风格为准：大量中文 Javadoc、4 空格缩进、常用 `record`、少量 Lombok
- Java 版本为 21：可以用 `record`、模式匹配等，但优先选择最简实现

### Imports

- 尽量使用 IDE 的 organize imports；同一文件内保持一致
- 新增代码尽量避免通配符 import（如 `okhttp3.*` / `org.springframework.web.bind.annotation.*`），但不要为了“统一”去大规模改旧代码

### 命名与分层

- 包名全小写，按领域分包：`holiday`、`aihub`、`common`、`config`
- Spring 组件命名：`XxxController`、`XxxService`、`XxxFetcher`、`XxxScheduler`
- URL 命名倾向：`/api/...` + kebab-case（例：`/api/holiday/is-holiday`）

### 类型与数据结构

- DTO/返回值：优先用 `record`（例：`ApiResponse<T>`、`CodexOAuthService.*Result`）
- JSON 处理：仓库当前使用 `tools.jackson.databind.json.JsonMapper`；除非有明确原因，不要擅自切换到其他 mapper 或改包名
- 常量：用 `private static final`，并给出简短中文注释（项目内已大量使用）

### 错误处理（与 HTTP 语义）

- 参数错误/客户端错误：优先抛 `IllegalArgumentException`（由 `GlobalExceptionHandler` 映射为 400）
- 服务端状态错误：抛 `IllegalStateException`（未捕获会落到 500）
- 需要携带 HTTP 状态码的场景：可用 Spring 的 `ErrorResponseException`
- 不要吞异常：除非返回 `null` 就是明确的业务语义（例：token 解析失败）

### 日志

- 统一用 `@Slf4j`；仅在关键边界/异常处记录
- 不要输出敏感信息（Authorization、token、cookie、数据库密码、OAuth 回调 URL 中的 code/state 等）

### 测试

- 默认使用 JUnit 5；新增测试尽量放在对应包路径下（`src/test/java/...`）
- 单测命名按 `*Tests` 或 `*Test`，与现有保持一致

## 代码风格与约定（前端 / ui / TypeScript）

### 基本原则

- TypeScript：`strict: true`；避免 `any`，用 `unknown` + 类型收窄
- 路径别名：使用 `@/` 指向 `ui/src`（见 `ui/tsconfig*.json`、`ui/vite.config.ts`）
- 不要一次性重排 import 或改动大量格式；保持当前文件风格（本仓库未配置 ESLint/Prettier）

### Imports

- 类型导入使用 `import type { ... }`（项目内已有）
- import 分组建议：第三方 → 空行 → `@/` → 相对路径
- 是否带 `.ts/.tsx` 扩展：保持当前文件既有习惯；新增时默认不写扩展名，除非该文件已普遍使用扩展

### 格式化

- TS/TSX 普遍使用双引号、无分号；缩进以当前文件为准（多数为 4 空格）
- JSX：自闭合标签使用 `<Comp/>` 风格（项目内已使用）

### API 与错误处理

- Axios 实例：统一用 `ui/src/lib/http.ts`（`baseURL: "/api"`）
- API 返回结构与后端一致：`ApiResponse<T> { code, data, msg }`（见 `ui/src/lib/api/holiday.ts`）
- 捕获异常时：提取后端 `msg` 并抛出 `Error`，页面层只展示可读信息

### UI 组件

- 组件库：Radix UI + Tailwind（含 shadcn 风格组件，见 `ui/components.json`）
- className 合并：用 `cn(...)`（见 `ui/src/lib/utils.ts`）
- 主题：通过切换 `document.documentElement` 的 `dark` class（见 `ui/src/components/app/theme-toggle.tsx`）

## 工作区卫生

- 不要改/提交生成目录：`target/`、`ui/node_modules/`、`ui/dist/`
- 避免在文档/日志里传播敏感配置：`src/main/resources/application.yaml` 当前包含数据库密码等明文配置
