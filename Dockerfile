# ---------- 构建：共享包、前端、后端 ----------
FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

# 先复制依赖清单，利用镜像层缓存避免每次改代码都重新安装依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/ apps/
# 按依赖顺序构建：共享包先于前后端。测试要起 Testcontainers，镜像构建里没有 Docker，所以只构建；测试在提交前本地跑
RUN pnpm build

# ---------- 裁出后端的生产依赖 ----------
FROM build AS deploy

# 工作区没有开 inject-workspace-packages（开了开发时共享包就不会随改随生效），所以用 legacy 方式部署
RUN pnpm --filter server deploy --prod --legacy /deploy
# 前端产物放在后端旁边，由后端的静态文件模块统一提供
RUN cp -R apps/web/dist /deploy/client

# ---------- 运行时 ----------
FROM node:24-alpine

WORKDIR /app
COPY --from=deploy /deploy ./

# 官方镜像自带的非 root 用户
USER node
EXPOSE 8000

# 配置全走环境变量，清单见 apps/server/.env.example；时区用 TZ 环境变量指定。启动时自动执行数据库迁移
CMD ["node", "dist/main.js"]
