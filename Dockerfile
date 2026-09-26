# ---------- 构建：前端 ----------
# 前端的类型检查 vue-tsc 要靠 Node 的模块加载改写 TypeScript，放在 Bun 下跑认不出 .vue，所以构建阶段用 Node 镜像再带上 Bun
FROM node:24-alpine AS build
COPY --from=oven/bun:1.4.2-alpine /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

# 先复制依赖清单，利用镜像层缓存避免每次改代码都重新安装依赖；Bun 的下载缓存挂成构建缓存。
# 这一阶段只构建前端，但前端的类型检查顺着 import type { App } 读到后端源码，后端源码引的包也要解析得到，
# 所以连后端的依赖与源码一起放进来（只用于类型检查，不进运行时镜像）
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --filter web --filter server

COPY packages/ packages/
COPY apps/server/src apps/server/src
COPY apps/web/ apps/web/
# 后端与共享包由 Bun 直接运行源码，不用构建；测试要起 Testcontainers，镜像构建里没有 Docker，所以只构建前端，测试在提交前本地跑
RUN bun --filter web build

# ---------- 运行时 ----------
FROM oven/bun:1.4.2-alpine

WORKDIR /app

# 只装后端（连带共享包）的生产依赖
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --production --filter server

COPY packages/shared/src packages/shared/src
# tsconfig 要一起带上：路径别名由 Bun 照它解析
COPY apps/server/tsconfig.json apps/server/
COPY apps/server/drizzle apps/server/drizzle
COPY apps/server/src apps/server/src
# 前端产物放在后端旁边，由后端的 static-files.ts 统一提供
COPY --from=build /app/apps/web/dist apps/server/client

WORKDIR /app/apps/server
# 官方镜像自带的非 root 用户
USER bun
EXPOSE 8000

# 配置全走环境变量，清单见 apps/server/.env.example；时区用 TZ 环境变量指定。启动时自动执行数据库迁移
CMD ["bun", "src/main.ts"]
