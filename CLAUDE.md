# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

仓库不再使用 monorepo / pnpm workspace，`frontend` 与 `backend` 是两个互相独立的项目，各自在自己的目录下执行命令。

### Backend (Go + Gin + sqlx)
```bash
cd backend
go run ./cmd/server            # 启动开发服务器 (port 8000)，自动读取 backend/.env
go build ./...                 # 编译检查
go vet ./...                   # 静态检查
go test ./...                  # 单元测试
```

### Frontend (Vite + Vue 3 + TypeScript)
```bash
cd frontend
pnpm install
pnpm dev                       # 启动开发服务器（代理 /api → localhost:8000）
pnpm build                     # vue-tsc 类型检查 + vite 构建
```

### Docker
```bash
docker build -t myapi:latest .   # 多阶段构建：前端 → Go 编译 → alpine 运行时
```

## Architecture

前后端分离的两个独立项目，生产环境前端静态资源由 Go 后端提供。

### 项目结构
```
backend/                        # Go 项目，模块名 myapi（Gin + sqlx + pgx）
  go.mod
  cmd/server/main.go            # 入口：装配依赖、启动初始化、优雅关闭
  internal/
    apiresponse/                # 统一响应结构 Response{code,data,msg}
    config/                     # viper 配置加载（DB_URL）
    database/                   # sqlx 连接池
    logging/                    # log/slog 日志实例（固定 JSON 输出）
    server/                     # gin 引擎装配、中间件、SPA 静态资源
    web/                        # go:embed 内嵌前端产物；dist/ 仅含 .gitkeep，构建时由前端产物填充
    holiday/                    # 节假日模块（model / remote / repository / service / handler）
                                # 当前唯一接口：GET /api/holiday/is-holiday?date=YYYY-MM-DD → ApiResponse<boolean>

frontend/                       # Vue 3.5, Vite 8, TypeScript 6 (严格模式), TSX, Tailwind CSS 4
                                # 当前无业务页面，仅保留基础设施骨架
  src/
    main.ts                     # 应用入口：Pinia + 路由 + Element Plus 样式
    App.tsx                     # 根组件：Element Plus 中文化 + 路由出口
    router/                     # 路由实例，routes 下 children 为空，新页面在此登记
    layouts/AppLayout.tsx       # 顶栏 + 响应式侧栏 + 内容区
    components/AppSidebar.tsx   # 侧栏导航，navItems 为空数组
    stores/AppStore.ts          # Pinia：暗色主题 + 移动端断点
    api/httpClient.ts           # Axios 封装，拦截器解包 ApiResponse
    types/apiResponse.ts        # ApiResponse<T> 类型（后端以 Go 结构体对齐同一 JSON 契约）
    styles/index.css            # Tailwind 4 入口：@import "tailwindcss" + @theme + dark 自定义变体
  pnpm-workspace.yaml           # 仅承载 pnpm 设置（allowBuilds），不声明工作区成员
```

### 关键架构决策
- **后端分层**：handler（HTTP）→ service（业务）→ repository（SQL），依赖通过构造函数注入，无全局单例
- **数据库**：PostgreSQL，sqlx + pgx 驱动，手写 SQL（不使用 ORM、不运行 migration）
- **统一响应**：`apiresponse.Response{code,data,msg}`，与前端 `ApiResponse<T>` 字段一致
- **错误处理**：handler 通过 `c.Error` 上报，`errorHandler` 中间件统一转 500 JSON；panic 由 `recovery` 中间件兜底
- **无环境模式切换**：不区分开发/生产。gin 固定 ReleaseMode，日志固定 JSON
- **静态资源**：前端产物经 `go:embed` 编入二进制（`internal/web`），运行镜像无 public 目录。直接用 `gin-contrib/static` 的 `EmbedFolder` + `Serve("/")`，无自定义包装。前端是 hash 路由（`createWebHashHistory`），服务端只会收到 `/`，因此不需要 SPA 深链接回退——不要再加
- **API 404**：`/api/*` 未匹配在 `NoRoute` 中返回 JSON `{code:404,...}`，其余路径保持 gin 默认 404
- **配置加载**：用 viper（`internal/config`），在工作目录读 `.env`（`SetConfigFile` + `SetConfigType("env")`，文件不存在时跳过）并开启 `AutomaticEnv`，环境变量优先级高于 `.env`。不再使用 godotenv
- **环境变量**：`DB_URL`（必填，开发环境可写入 `backend/.env`）、`TZ`（可选，容器内已安装 tzdata）
- **前端组件**：使用 TSX（非 SFC），Element Plus UI 框架 + Tailwind CSS
- **路径别名**：仅 `@` → `frontend/src/`（tsconfig paths + vite alias 两处同步配置；TS 6 已弃用 `baseUrl`，不要加回）
- **Tailwind 4**：CSS-first 配置，无 `tailwind.config.cjs` / `postcss.config.cjs`。走 `@tailwindcss/vite` 插件（内置 Lightning CSS，不需要 postcss/autoprefixer）；暗色模式靠 `@custom-variant dark (&:where(.dark, .dark *))` 保持 class 策略
- **TypeScript 版本**：锁在 6.x（`~6.0.3`）。7.x 是 Go 原生重写版，vue-tsc 尚不兼容，不要升
