# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

### Monorepo (pnpm workspace)
```bash
pnpm install                   # 根目录安装所有依赖
pnpm build                     # 全量编译（前端构建 + 后端类型检查，修改后必须运行验证）
```

### Backend (Hono.js + Drizzle ORM + TypeScript)
```bash
pnpm dev:backend               # 启动后端开发服务器 (port 8000, tsx watch)
pnpm --filter backend build    # tsc 类型检查（不产出编译文件）
```

### Frontend (Vite + Vue 3 + TypeScript)
```bash
pnpm dev:frontend              # 启动前端开发服务器（代理 /api → localhost:8000）
pnpm --filter frontend build   # vue-tsc 类型检查 + vite 构建
```

### Docker
```bash
docker build -t myapi:latest .   # 多阶段构建：前端 → 运行时（tsx 直接运行 .ts 源码）
```

## Architecture

全栈 monorepo 应用，pnpm workspace 管理三个包。生产环境前端静态资源由后端 serveStatic 提供。

### 项目结构
```
packages/
  shared/                       # @myapi/shared — 前后端共享类型和工具（不编译，直接导出 .ts 源文件）
    src/
      apiResponse.ts            # ApiResponse<T> 类型 + 工厂函数
      holiday.ts                # NextOffDayResult 类型
      pagination.ts             # PaginatedResult<T> 类型

backend/                        # Hono.js, Drizzle ORM, TypeScript, tsx 运行
  src/
    db/                         # Drizzle schema 定义 + 数据库客户端
    holiday/                    # 节假日查询模块
    index.ts                    # 入口文件

frontend/                       # Vue 3.5, Vite 7, TypeScript 5.9 (严格模式), TSX
  src/
    api/                        # Axios HTTP 客户端，按模块拆分 API 调用
    views/                      # 页面组件 (TSX)
    components/                 # 公共 UI 组件
    stores/                     # Pinia 状态管理
    layouts/                    # 布局组件
```

### 关键架构决策
- **Monorepo**：pnpm workspace，`@myapi/shared` 包共享类型定义（导出 .ts 源文件，消费方通过 tsconfig paths + vite alias 解析）
- **数据库**：PostgreSQL，Drizzle ORM 声明式 schema（不运行 migration）
- **统一响应**：`ApiResponse<T>` 类型 + ok / badRequest / notFound / internalServerError 工厂函数（在 shared 包中）
- **日期处理**：全部使用 dayjs，避免原生 Date 时区陷阱
- **前端组件**：使用 TSX（非 SFC），Element Plus UI 框架 + Tailwind CSS
- **路径别名**：前端 `@` → `src/`，`@myapi/shared/*` → `packages/shared/src/*`
