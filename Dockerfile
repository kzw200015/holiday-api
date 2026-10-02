# 由 Bun 直接运行 TypeScript 源码，不用构建；测试要起 Testcontainers，镜像构建里没有 Docker，测试在提交前本地跑。
# 镜像标签与 package.json 的 packageManager 一起升
FROM oven/bun:1.4.2-alpine

WORKDIR /app

# 先复制依赖清单，利用镜像层缓存避免每次改代码都重新安装依赖；Bun 的下载缓存挂成构建缓存。只装生产依赖
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --production

# tsconfig 要一起带上：路径别名由 Bun 照它解析
COPY tsconfig.json ./
COPY drizzle drizzle
COPY src src

# 官方镜像自带的非 root 用户
USER bun
EXPOSE 8000

# 配置全走环境变量，清单见 .env.example。启动时自动执行数据库迁移
CMD ["bun", "src/main.ts"]
