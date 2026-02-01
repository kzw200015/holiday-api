# Repository Guidelines

## 项目结构与模块组织

- 后端为 Spring Boot（Java 21）单模块 Maven 工程：`pom.xml`、`src/main/java`、`src/main/resources`、`src/test/java`。
- 静态资源与模板位于 `src/main/resources/static`、`src/main/resources/templates`（如有需要可用于服务端渲染或静态托管）。
- `ui/` 为前端工程（Vite + React + TypeScript + Tailwind），产物默认输出到 `ui/dist`。

## 构建、测试与本地运行

后端（建议使用仓库自带 Wrapper）：

```bash
./mvnw clean package        # 编译并打包（默认会跑测试）
./mvnw test                 # 仅运行测试
./mvnw spring-boot:run      # 本地启动服务
```

前端（使用 pnpm）：

```bash
pnpm -C ui install
pnpm -C ui dev              # 本地开发
pnpm -C ui build            # 生产构建
```

## 代码风格与命名约定

- Java 代码统一 4 空格缩进，禁止 Tab；类 `PascalCase`，方法/变量 `camelCase`，常量 `UPPER_SNAKE_CASE`。
- 包名以 `com.github.kzw200015.javaapi` 为根；新增功能优先按领域拆分 package（controller/service/mapper 等按项目现有习惯）。
- 避免“无意义兜底”和重复校验，充分信任上游数据；避免魔法字符串，优先使用常量或枚举。

## 测试指南

- 测试使用 JUnit 5（Spring `@SpringBootTest`）。测试类放在 `src/test/java`，命名建议 `*Test` 或 `*Tests`。
- 如测试/启动依赖数据库等外部资源，请通过环境变量、启动参数或本地配置覆盖连接信息，勿提交真实凭据。

## 提交与 PR 规范

- 提交信息遵循 Conventional Commits 风格，历史中常见：`feat: ...`（中文描述可接受），例如 `feat: 主题切换`。
- PR 需说明变更点、影响范围与验证方式（附上执行过的命令）；涉及 `ui/` 的页面改动请附截图或录屏。
