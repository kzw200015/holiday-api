# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

单体应用：`backend`（Bun + TypeScript + Hono + Drizzle ORM，端口 8000）提供 `/api` 接口，`frontend`（Vue 3 + Vite + TypeScript）提供页面。生产镜像里前端产物被放进后端的 `public/`，由同一个 Bun 进程直接提供静态文件。

## 常用命令

后端（在 `backend/` 下，包管理器固定为 bun；Bun 直接运行 TS 源码，没有编译产物）：

```bash
bun install
bun run dev                          # 启动后端并监听文件变更，监听 8000
bun start                            # 启动后端（不监听变更）
bun test                             # 跑全部测试
bun test holidayController           # 只跑文件名匹配的测试文件
bun test -t "detail 返回"            # 只跑名称匹配的测试用例（匹配 test() 的中文描述）
bun run typecheck                    # tsc --noEmit；Bun 运行时不做类型检查，提交前手动跑
```

前端（在 `frontend/` 下，包管理器固定为 pnpm）：

```bash
pnpm install
pnpm dev      # 开发服务器，/api 反向代理到 http://localhost:8000
pnpm build    # vue-tsc 类型检查 + vite 构建，产物在 dist/
```

整体镜像构建（多阶段：前端 `pnpm build` → 后端 `bun run typecheck` → 仅装生产依赖的 `oven/bun` 运行时镜像，前端产物拷到 `/app/public`）：

```bash
docker build -t myapi .
```

无 lint 工具链，代码风格由 `.editorconfig`、`pnpm build` 与 `bun run typecheck` 的类型检查约束。安装依赖与构建命令需关闭沙箱执行。本地起后端做冒烟时注意：Bun 的 fetch 不认 `NO_PROXY`，会话里若设了代理环境变量，访问 `localhost` 的请求会被代理吞掉（返回空 503），用 `env -i PATH="$PATH" HOME="$HOME" bun ...` 起干净环境。

## 后端架构

源码根 `src/`，按业务功能分目录（`holiday`），横切关注点单独分目录（`apiresponse`、`web`、`time`）。没有依赖注入容器，也不用 class：Service、远程客户端、控制器、应用都是 `createXxx()` 工厂函数，把依赖闭包进去后返回一个普通对象，对外类型用 `ReturnType<typeof createXxx>` 从实现推导，不另写 interface；`src/index.ts` 是组装根，手工建好 Drizzle 实例、逐层调用工厂再传给 `createApp`。工厂函数只声明自己需要的依赖类型（如控制器只依赖 `Pick<HolidayService, "query">`），测试据此直接传假对象。

**统一响应契约**：所有接口返回 `ApiResponse { code, data, msg }`，字段顺序即序列化顺序。`app.ts` 里 `app.all("/api/*")` 兜住未匹配的 `/api` 路径返回 JSON 格式的 404，`onError` 把未捕获异常转成同一结构的 500；其余路径找不到静态文件时保持空响应体的 404（前端是哈希路由，静态资源兜底逻辑依赖这一点）。后端 `src/apiresponse/apiResponse.ts` 与前端 `src/types/apiResponse.ts` 是一对，改一边要同步另一边。

**节假日模块分层**：`holidayController.ts`（Hono 子路由，参数校验用 `web/apiValidator.ts` 包过的 zod，失败统一回 `ApiResponse` 结构的 400）→ `HolidayService`（业务判断，同时直接写查询条件与存储约定，没有单独的数据访问层）→ Drizzle（`holidayModels.ts` 里的 `pgTable` 声明，驱动为 Bun 内置 `bun:sql`）。没有迁移脚本，`pgTable` 只声明代码会读写的列，用来推导类型和拼 SQL。

几个已在注释中固化的约束，修改时不要推翻：

- `GET /api/holiday/is-holiday` 有外部调用方，响应体 `data` 固定为 boolean。
- 日期有两种表示，规则在 `time/date.ts`：数据库列和接口出入参用 `YYYY-MM-DD` 字符串（`IsoDate`）；HTTP 入口校验时用 `calendarDateSchema` 一次性解析成 `@internationalized/date` 的 `CalendarDate`（只有年月日、无时区，等价于原来的 `LocalDate`，前端日历组件也用这个库），业务层按对象传递，落库或写响应体时 `toString()` 转回字符串，不用原生 `Date`。格式规则只有一份 `isoDateSchema`（`z.iso.date()`，严格位数 + 日历合法性），远程 JSON 也用它校验；解析只走 `parseDate`，不要手写 `new CalendarDate(...)`（会静默钳位）。控制器的 `date` 参数省略或空串取当天，校验失败的文案固定为「日期格式错误，应为 YYYY-MM-DD」。
- `date` 列存 `YYYY-MM-DD` 字符串，年份即前缀，`refreshYear` 靠 `like(date, "YYYY-%")` 删旧数据。该列有唯一索引 `holiday_days_date_key`，`query` 因此 `limit(2)` 后多行即抛，而不是静默取第一条。
- `refreshYear` 用 `db.transaction` 包住「先删后插」，回调抛错即回滚；插入是单条多行 `INSERT`，`values([])` 会被 Drizzle 拒绝，所以远程为空时只删不插（2027 年数据未发布前就是这种情况）。
- 远程拉取放在事务外，不让最长 60 秒的 HTTP 调用占着数据库连接；远程响应用 zod 校验结构后才入库。

**启动依赖与定时刷新**：`src/index.ts` 在监听端口之前调用 `refreshUpcomingYears()` 并行拉取当年和次年数据，任一失败即以未处理的 rejection 退出进程。因此本地跑后端需要能连上 PostgreSQL 且能访问 `raw.githubusercontent.com`。启动后 `setInterval` 按 `config.holiday.refreshIntervalMs`（默认 24 小时）重复同一刷新，年份每次重新计算所以跨年不用重启；定时刷新失败只记日志不退出，库里已有数据可继续服务。默认配置（连接串、连接池参数、端口、静态目录、刷新间隔、日志）都在 `src/config.ts`，部署时用 `DATABASE_URL` / `PORT` / `STATIC_DIR` / `HOLIDAY_REFRESH_INTERVAL_MS` / `LOG_LEVEL` / `LOG_FORMAT` 环境变量覆盖。仓库内没有建表脚本，`holiday_days` 表需预先存在。

**日志**：用 pino，`src/logger.ts` 导出进程级单例 `logger`，各模块直接 import，不写 `console.*`。写法固定为 `logger.info({ 结构化字段 }, "消息")`，错误放在 `err` 键（pino 自带序列化）。格式默认按 stdout 是否终端自动选：终端 pretty（pino-pretty 同步流，不走 transport 的 worker 线程，Bun 上更稳），容器 json；`bun test` 下默认静音。`web/requestLogger.ts` 只挂在 `/api/*` 上记访问日志（方法、路径、状态码、耗时），静态资源不记。

**测试**：`bun:test`，测试文件与源码同目录（`*.test.ts`）。用 `createApp` 组装一个传入假 service 的应用，通过 `app.request()` 走完整处理链，只覆盖路由与响应结构，不连数据库和远程数据源。断言直接比对完整 JSON 字符串，所以响应字段顺序变化会导致测试失败。

## 前端架构

**组件一律用 TSX 写**（`defineComponent` + `setup` 返回渲染函数），不写 `.vue` 单文件组件 —— `src/components/ui/` 下的 `.vue` 是 shadcn-vue 生成的产物，属于可直接修改的项目源码，但新增业务组件请沿用 TSX。JSX 支持来自 `@vitejs/plugin-vue-jsx`。

目录职责：`views/`（页面）、`layouts/`（应用外壳与侧边栏）、`api/`（接口封装）、`stores/`（Pinia）、`components/ui/`（shadcn-vue 组件）。`@` 别名指向 `src`。

**路由与导航的单一来源**：路由表 `router/index.ts` 的 `meta.title` 是页面名称的唯一定义处，顶栏标题与侧边栏文案都从这里取；`layouts/navigation.ts` 只声明「哪些路由进侧边栏、用什么图标」。新增页面 = 加一条路由记录（含 `meta.title`），需要进侧边栏再往 `navigationItems` 追加一项。使用哈希路由（`createWebHashHistory`）。

**HTTP 层**：`api/httpClient.ts` 的 axios 响应拦截器已把 `response.data` 解包，并把错误统一转成携带后端 `msg` 的 `Error`。业务侧只写 `api/xxx.ts` 里的具名函数，不要直接用 axios。

**主题**：暗色用 `html.dark` class 策略（`styles/index.css` 里的 `@custom-variant dark` 覆盖了 Tailwind 4 默认的媒体查询策略），由 `AppStore` 统一切换，并同步 `meta[name=theme-color]`。主题初始化在 `main.ts` 挂载前执行，避免首帧闪白。

**Tailwind 4**：无 `tailwind.config`，主题变量全部写在 `styles/index.css` 的 `@theme` / `@theme inline` 中。`.vscode/settings.json` 已把 `.css` 关联到 tailwindcss 语言模式并声明 `cn`/`cva` 为类名函数。

## 语言约定

代码注释、提交信息与文档一律用简体中文。注释写「为什么这么做」而非复述代码，现有代码里的取舍说明（事务边界、日期表示方式、CSS 覆盖原因等）是主要的上下文来源，改动相关代码时同步更新。

**标识符一律用英文**，常规 camelCase。`bun:test` 的 `test()` 名称是普通字符串而非标识符，直接写中文描述（`bun test -t` 按它过滤）。

## Agent skills

### Issue tracker

问题与规格以 Markdown 文件形式存放在 `.scratch/` 下。详见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用五个标准角色的默认标签字符串。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。
