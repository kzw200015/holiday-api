# ---------- 前端构建 ----------
FROM node:24-alpine AS frontend-builder

WORKDIR /app
RUN corepack enable

# 先复制依赖清单，利用镜像层缓存避免每次改代码都重新安装依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/
# 末尾的 ... 表示连同它依赖的工作区包一起、按依赖顺序构建
RUN pnpm --filter web... build

# ---------- 后端构建 ----------
FROM eclipse-temurin:25-jdk AS backend-builder

WORKDIR /src
COPY backend/ ./
# 前端产物放进 Spring Boot 默认的静态资源位置，随 jar 一起打包，由后端直接提供
COPY --from=frontend-builder /app/apps/web/dist ./src/main/resources/static
# 测试要起 Testcontainers，镜像构建里没有 Docker，所以只打包；测试在提交前本地跑。
# 进程不碰 DDL，schema.sql 由人工上库执行
RUN --mount=type=cache,target=/root/.gradle ./gradlew bootJar --no-daemon

# ---------- 运行时 ----------
FROM eclipse-temurin:25-jre-alpine

RUN adduser -D -u 10001 app

WORKDIR /app
# bootJar 只产出这一个可执行 jar
COPY --from=backend-builder /src/build/libs/*.jar ./app.jar

USER app
EXPOSE 8000

# 配置全走环境变量，名字见 backend/config/application.example.yml；时区用 TZ 环境变量指定
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
