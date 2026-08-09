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
                                # GET /api/holiday/is-holiday?date=YYYY-MM-DD → ApiResponse<boolean>（有外部调用方，契约不可改）
                                # GET /api/holiday/detail?date=YYYY-MM-DD → ApiResponse<{date,isOffDay,name}>
                                # date 省略时取当天；两个接口共用 service.Query

frontend/                       # Vue 3.5, Vite 8, TypeScript 6 (严格模式), TSX, Tailwind CSS 4, shadcn-vue
  components.json               # shadcn-vue 配置：style=reka-nova, baseColor=zinc, iconLibrary=lucide
  src/
    main.ts                     # 应用入口：Pinia + 路由 + 全局样式，挂载前落地主题
    App.tsx                     # 根组件：仅路由出口
    router/                     # 路由实例，业务页面作为 AppLayout 的子路由登记；meta.title 为页面名称
    layouts/
      AppLayout.tsx             # 应用外壳：SidebarProvider + AppSidebar + SidebarInset（顶栏 sticky）
      AppSidebar.tsx            # 侧边栏内容，基于 shadcn-vue 的 Sidebar
      navigation.ts             # 侧边栏展示哪些路由（name + icon），名称与路径均取自路由表
    views/                      # 页面组件（HomeView 为占位内容；HolidayView 为日历点选查询节假日）
    components/ui/              # shadcn-vue 生成的组件源码（SFC），由 CLI 维护
    lib/utils.ts                # shadcn-vue 的 cn()：clsx + tailwind-merge
    stores/AppStore.ts          # Pinia：暗色主题（同步 html.dark 与 meta[theme-color]）
    api/httpClient.ts           # Axios 封装，拦截器解包 ApiResponse
    api/holiday.ts              # 节假日接口调用与响应类型（与后端 holiday.QueryResult 对齐）
    types/apiResponse.ts        # ApiResponse<T> 类型（后端以 Go 结构体对齐同一 JSON 契约）
    styles/index.css            # Tailwind 4 入口 + tw-animate-css + shadcn 主题变量（:root / .dark）
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
- **UI 组件库**：用 shadcn-vue（底层 Reka UI + Tailwind），组件源码复制进 `src/components/ui`，不是运行时依赖。已移除 Element Plus，不要再引入其他有样式的组件库
- **新增组件**：走 CLI `npx shadcn-vue@latest add <组件名>`，不要手抄源码。CLI 用 undici 的 `ProxyAgent` 读 `https_proxy`，与本机代理不兼容，需清空该变量执行：`https_proxy= HTTPS_PROXY= npx shadcn-vue@latest add <组件名> -y`
- **UI 组件是 SFC**：`src/components/ui` 下由 CLI 生成的是 `.vue` 文件，保持原样便于后续 CLI 升级；业务代码（layouts / views）仍写 TSX，直接引入这些 SFC 即可
- **TSX 中传原生属性与事件**：shadcn 组件只声明自己的 props，`onClick`、`type`、`disabled` 等原生属性在 TSX 里会被类型检查拒绝（运行时经 `inheritAttrs` 正常透传），一律用展开：`{...{ onClick: fn }}`、`{...{ type: "submit", disabled: true }}`
- **图标库**：`@lucide/vue`，统一用带 `Icon` 后缀的导出名（如 `HouseIcon`），与 CLI 生成代码保持一致
- **Calendar 与日期值**：日期选择用 shadcn-vue 的 Calendar（CLI 会连带装出 `native-select`），值类型是 `@internationalized/date` 的 `DateValue`。该包是 reka-ui 的传递依赖，CLI 不会写进 `package.json`，需自行 `pnpm add @internationalized/date`。`DateValue` 带私有字段，用 `ref` 存会被深度解包导致类型退化（报 `ZonedDateTime` 缺属性），必须用 `shallowRef`。点击已选中的日期时 reka-ui 会发出 `undefined`，回调里要判空
- **`@import "shadcn-vue/tailwind.css"` 必须保留**：这个文件随 `shadcn-vue` 包（devDependency）分发，定义了组件依赖的 9 个 `data-*` 变体（把 reka-ui 输出的 `data-state="open"` 映射到 `data-open:` 等写法）、accordion 的 keyframes 与 scroll-fade 工具类。CLI 不会注入这行，官方安装文档也没写，但少了它，所有进出场动画和 `data-checked` / `data-selected` 等状态样式会静默失效——不报错，只是没效果
- **垂直 Separator**：shadcn-vue 的 Separator 用 `data-[orientation=vertical]:self-stretch`（React 版是 `h-full`）。只传 `data-[orientation=vertical]:h-4` 限制高度时，`self-stretch` 属于 align-self 组不会被 tailwind-merge 挤掉，会覆盖父级 `items-center` 把短线顶到容器顶部，需一并传 `data-[orientation=vertical]:self-center`
- **主题与配色**：颜色一律用 shadcn 的语义变量（`bg-background`、`text-muted-foreground`、`bg-sidebar` 等），不要写死 `zinc-*` 之类的调色板类名；变量定义在 `index.css` 的 `:root` / `.dark` 两个块
- **外部字体**：CLI 可能向 `index.css` 顶部注入 Google Fonts 的 `@import`，需删除（国内不可达）；字体统一由 `@theme` 的 `--font-sans` 指定
- **响应式布局**：断点 768 像素。侧边栏折叠与移动端抽屉全部由 `SidebarProvider` 托管（内部用 `useMediaQuery`），折叠状态写入 `sidebar_state` cookie，快捷键 Cmd/Ctrl + B。需要移动端断点状态时取 `useSidebar().isMobile`，不要另起一套 `matchMedia`。页面为文档流滚动（`min-h-svh`），顶栏靠 `sticky` 固定，因此 `html/body/#app` 用 `min-h-full` 而非 `h-full`
- **页面名称与导航**：页面名称只写在路由的 `meta.title`，顶栏标题与侧边栏共用；`layouts/navigation.ts` 只声明侧边栏展示哪些路由（`name` + 图标）与顺序，跳转用 `to={{ name }}`，选中态用 `route.matched`，不要手写路径前缀匹配
- **pnpm 构建脚本**：新增依赖若带 postinstall，pnpm 会以 `ERR_PNPM_IGNORED_BUILDS` 非零退出，需在 `frontend/pnpm-workspace.yaml` 的 `allowBuilds` 中显式放行
- **路径别名**：仅 `@` → `frontend/src/`。三处需同步：`tsconfig.app.json`（实际编译）、`tsconfig.json`（供 shadcn-vue CLI 读取）、`vite.config.ts`。TS 6 已弃用 `baseUrl`，不要加回
- **Tailwind 4**：CSS-first 配置，无 `tailwind.config.cjs` / `postcss.config.cjs`。走 `@tailwindcss/vite` 插件（内置 Lightning CSS，不需要 postcss/autoprefixer）；暗色模式靠 `@custom-variant dark (&:where(.dark, .dark *))` 保持 class 策略
- **TypeScript 版本**：锁在 6.x（`~6.0.3`）。7.x 是 Go 原生重写版，vue-tsc 尚不兼容，不要升
