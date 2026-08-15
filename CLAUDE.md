# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

单体应用：`backend`（Spring Boot 4 + Kotlin + MyBatis-Plus，端口 8000）提供 `/api` 接口，`frontend`（Vue 3 + Vite + TypeScript）提供页面。生产构建时前端产物被塞进后端的 `src/main/resources/static`，最终打成一个可执行 jar。

## 常用命令

后端（在 `backend/` 下，使用 Gradle wrapper）：

```bash
./gradlew bootRun                                  # 启动后端，监听 8000
./gradlew test                                     # 跑全部测试
./gradlew test --tests '*HolidayControllerTest'    # 跑单个测试类
./gradlew test --tests '*HolidayControllerTest.detailReturnsDateIsOffDayAndName'  # 跑单个测试方法（认方法名，不认 @DisplayName）
./gradlew bootJar                                  # 打可执行 jar
```

前端（在 `frontend/` 下，包管理器固定为 pnpm）：

```bash
pnpm install
pnpm dev      # 开发服务器，/api 反向代理到 http://localhost:8000
pnpm build    # vue-tsc 类型检查 + vite 构建，产物在 dist/
```

整体镜像构建（多阶段，前端产物自动并入 jar）：

```bash
docker build -t myapi .
```

无 lint 工具链，代码风格由 `.editorconfig` 与 `pnpm build` 的类型检查约束。安装依赖与构建命令需关闭沙箱执行。

## 后端架构

包根 `io.github.kzw200015.myapi`，按业务功能分包（`holiday`），横切关注点单独分包（`apiresponse`、`web`）。

**统一响应契约**：所有接口返回 `ApiResponse(code, data, msg)`，字段顺序即序列化顺序。`GlobalExceptionHandler` 把异常统一转成同一结构；未匹配的 `/api` 路径返回 JSON 格式的 404，其余路径保持空响应体的 404（前端是哈希路由，静态资源兜底逻辑依赖这一点）。后端 `ApiResponse.kt` 与前端 `src/types/apiResponse.ts` 是一对，改一边要同步另一边。

**节假日模块分层**：`HolidayController` → `HolidayService`（业务判断）→ `HolidayDayRepository`（条件构造与存储约定）→ `HolidayDayMapper`（MyBatis-Plus `BaseMapper`）。没有 XML 映射文件，查询条件一律用 `KtQueryWrapper` 在 Repository 层构造。

几个已在注释中固化的约束，修改时不要推翻：

- `GET /api/holiday/is-holiday` 有外部调用方，响应体 `data` 固定为 boolean。
- `date` 列存 `YYYY-MM-DD` 字符串，年份即前缀，`replaceYear` 靠 `likeRight("$year-")` 删旧数据。该列有唯一索引 `holiday_days_date_key`，`findByDate` 因此用严格版 `selectOne`（多行即抛，而不是取第一条）。
- `replaceYear` 的 `@Transactional` 是跨 Bean 调用才生效（由 `HolidayService` 调用）。批量 `insert(Collection)` 内部虽然 `openSession(BATCH)`，但 mybatis-spring 装的是 `SpringManagedTransactionFactory`（连接取自 `DataSourceUtils`、会话 `commit()` 空转），仍在当前事务内 —— 已实测回滚后无残留，所以不需要退化成逐条 `insert`。该结论以单数据源 + Spring 管事务为前提。
- `isOffDay` 这类 `isXxx` 属性不需要标注 `@JsonProperty` / `@TableField`：jackson-module-kotlin 会原样保留 `is` 前缀，MyBatis-Plus 按字段名推列名并直接反射读写字段，两侧都绕开了 Kotlin 生成的 `setOffDay` 方法名。

**启动依赖**：`HolidayDataInitializer` 在启动时拉取当年和次年数据，失败即中止启动。因此本地跑后端需要能连上 PostgreSQL 且能访问 `raw.githubusercontent.com`。数据库连接写在 `application.yml`，部署时用 `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` 覆盖。仓库内没有建表脚本，`holiday_days` 表需预先存在。

**测试**：`@WebMvcTest` 切片 + `@MockitoBean`，只覆盖路由与响应结构，不连数据库和远程数据源。断言直接比对完整 JSON 字符串，所以响应字段顺序变化会导致测试失败。

## 前端架构

**组件一律用 TSX 写**（`defineComponent` + `setup` 返回渲染函数），不写 `.vue` 单文件组件 —— `src/components/ui/` 下的 `.vue` 是 shadcn-vue 生成的产物，属于可直接修改的项目源码，但新增业务组件请沿用 TSX。JSX 支持来自 `@vitejs/plugin-vue-jsx`。

目录职责：`views/`（页面）、`layouts/`（应用外壳与侧边栏）、`api/`（接口封装）、`stores/`（Pinia）、`components/ui/`（shadcn-vue 组件）。`@` 别名指向 `src`。

**路由与导航的单一来源**：路由表 `router/index.ts` 的 `meta.title` 是页面名称的唯一定义处，顶栏标题与侧边栏文案都从这里取；`layouts/navigation.ts` 只声明「哪些路由进侧边栏、用什么图标」。新增页面 = 加一条路由记录（含 `meta.title`），需要进侧边栏再往 `navigationItems` 追加一项。使用哈希路由（`createWebHashHistory`）。

**HTTP 层**：`api/httpClient.ts` 的 axios 响应拦截器已把 `response.data` 解包，并把错误统一转成携带后端 `msg` 的 `Error`。业务侧只写 `api/xxx.ts` 里的具名函数，不要直接用 axios。

**主题**：暗色用 `html.dark` class 策略（`styles/index.css` 里的 `@custom-variant dark` 覆盖了 Tailwind 4 默认的媒体查询策略），由 `AppStore` 统一切换，并同步 `meta[name=theme-color]`。主题初始化在 `main.ts` 挂载前执行，避免首帧闪白。

**Tailwind 4**：无 `tailwind.config`，主题变量全部写在 `styles/index.css` 的 `@theme` / `@theme inline` 中。`.vscode/settings.json` 已把 `.css` 关联到 tailwindcss 语言模式并声明 `cn`/`cva` 为类名函数。

## 语言约定

代码注释、提交信息与文档一律用简体中文。注释写「为什么这么做」而非复述代码，现有代码里的取舍说明（事务边界、Kotlin 注解目标、CSS 覆盖原因等）是主要的上下文来源，改动相关代码时同步更新。

**标识符一律用英文**，包括测试方法名：常规 camelCase，不用反引号包空格短句，中文描述写进 `@DisplayName`。测试报告和 IDE 里显示的是 `@DisplayName`，但 `--tests` 过滤只匹配方法名。

## Agent skills

### Issue tracker

问题与规格以 Markdown 文件形式存放在 `.scratch/` 下。详见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用五个标准角色的默认标签字符串。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。
