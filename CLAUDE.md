# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

### Backend (Gradle + Spring Boot 4 + Java 21)
```bash
cd backend
./gradlew compileJava          # 编译（修改后必须运行验证）
./gradlew bootRun              # 启动开发服务器 (port 8000)
./gradlew bootJar              # 构建可执行 JAR
./gradlew test                 # 运行测试
```

### Frontend (pnpm + Vite + Vue 3 + TypeScript)
```bash
cd frontend
pnpm install                   # 安装依赖
pnpm dev                       # 启动开发服务器（代理 /api → localhost:8000）
pnpm build                     # vue-tsc 类型检查 + vite 构建（修改后必须运行验证）
```

### Docker
```bash
docker build -t myapi:latest .   # 多阶段构建：前端 → 后端 → 运行时
```

## Architecture

全栈应用，后端 Spring Boot + 前端 Vue 3，生产环境前端静态资源打包到后端 JAR 中。

### 项目结构
```
backend/                        # Spring Boot 4, Gradle, Java 21
  src/main/java/.../myapi/
    codex/                      # 核心模块：Codex API 代理与账户管理
      controller/               #   CodexController (管理端), ResponsesController (代理端)
      service/
        account/                #   账户 CRUD、选择策略、会话粘连
        proxy/                  #   HTTP/SSE 请求转发（Abstract → Http/Sse 两个实现）
        oauth/                  #   OAuth 登录流程、Token 自动刷新
        quota/                  #   配额查询与解析
        log/                    #   请求日志记录与定时清理
        prompt/                 #   系统提示词配置
      dao/entity/, dao/mapper/  #   MyBatis-Plus 实体与 Mapper
      dto/                      #   数据传输对象（按子功能分包）
    holiday/                    # 节假日查询模块
    common/                     # 公共层：ApiResponse, PaginatedResult, GlobalExceptionHandler, JsonbTypeHandler
    config/                     # MybatisPlus 分页、RestClient、Scheduling(虚拟线程) 配置

frontend/                       # Vue 3.5, Vite 7, TypeScript 5.9 (严格模式), TSX
  src/
    api/                        # Axios HTTP 客户端，按模块拆分 API 调用
    views/                      # 页面组件 (TSX)
    components/                 # 公共 UI 组件
    stores/                     # Pinia 状态管理
    layouts/                    # 布局组件
```

### 关键架构决策
- **数据库**：PostgreSQL，使用 JSONB 类型 + 自定义 `JsonbTypeHandler`
- **ORM**：MyBatis-Plus，下划线自动转驼峰，Mapper XML 在 `resources/mapper/`
- **统一响应**：`ApiResponse<T>` record（ok / badRequest / notFound / internalServerError）
- **分页**：`PaginatedResult<T>` record，MyBatis-Plus 分页拦截器
- **代理架构**：`AbstractCodexProxyForwardService` 抽象基类，Http 和 SSE 两个实现
- **前端组件**：使用 TSX（非 SFC），Element Plus UI 框架 + Tailwind CSS
- **路径别名**：前端 `@` → `src/`
