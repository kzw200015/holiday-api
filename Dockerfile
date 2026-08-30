# ---------- 前端构建 ----------
FROM node:22-alpine AS frontend-builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable

# 先复制依赖清单，利用镜像层缓存避免每次改代码都重新安装依赖
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# ---------- 后端类型检查 ----------
# Bun 直接跑 TS 源码、不做类型检查，这一步补上「编译失败即构建失败」的保障
FROM oven/bun:1-alpine AS backend-typecheck

WORKDIR /app
COPY backend/package.json backend/bun.lock ./
# Bun 的包缓存挂成 BuildKit 缓存，跨构建复用已下载的包
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN bun run typecheck

# ---------- 运行时 ----------
FROM oven/bun:1-alpine

# Bun 自带时区数据，通过 TZ 环境变量指定时区即可
RUN adduser -D -u 10001 app

WORKDIR /app
# 只装生产依赖；包缓存在挂载里，不会进镜像层
COPY backend/package.json backend/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --production
# 源码从类型检查阶段取，确保该阶段真正参与构建（BuildKit 只构建最终镜像依赖到的阶段）
COPY --from=backend-typecheck /app/src ./src
# 迁移文件由进程启动时应用（见 src/index.ts 的 migrate 调用），必须进镜像；
# 生成它们的 drizzle-kit 是开发依赖，运行时用不到
COPY backend/drizzle ./drizzle
# 前端产物放入静态资源目录，由后端直接提供
COPY --from=frontend-builder /app/dist ./public

USER app
EXPOSE 8000

ENTRYPOINT ["bun", "src/index.ts"]
