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

# ---------- 后端构建 ----------
FROM eclipse-temurin:25-jdk AS backend-builder

WORKDIR /src
COPY backend/gradle ./gradle
COPY backend/gradlew backend/settings.gradle.kts backend/build.gradle.kts ./
COPY backend/src ./src
# 前端产物放入静态资源目录，随可执行 jar 一起打包
COPY --from=frontend-builder /app/dist ./src/main/resources/static

# Gradle 用户目录挂成 BuildKit 缓存，依赖 jar 与 wrapper 发行版跨构建复用，
# 不会因为源码变更而失效（dependencies 任务只解析元数据、不下载 jar，起不到预热作用）
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon bootJar

# ---------- 运行时 ----------
FROM eclipse-temurin:25-jre-alpine

# JDK 自带时区数据库，通过 TZ 环境变量指定时区即可
RUN adduser -D -u 10001 app

WORKDIR /app
# 前端资源已打进 jar，运行时只需这一个文件
COPY --from=backend-builder /src/build/libs/*.jar ./app.jar

USER app
EXPOSE 8000

ENTRYPOINT ["java", "-jar", "app.jar"]
