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
# 没有单独的类型检查阶段：go build 本身就是编译，编不过就构建失败
FROM golang:1.27-alpine AS backend-builder

WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY backend/ ./
# CGO 关掉换一个纯静态的二进制，运行镜像里不需要 libc 之外的任何东西。
# 进程不碰 DDL，建表用 backend/internal/store/schema.sql 由人工上库执行，镜像里不带它
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/myapi ./cmd/myapi

# ---------- 运行时 ----------
FROM alpine:3

# 时区数据由 time/tzdata 编进了二进制，这里只需要根证书（要访问 e 站和 GitHub）
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app

WORKDIR /app
COPY --from=backend-builder /out/myapi ./myapi
# 前端产物放进静态资源目录，由后端直接提供（默认就找可执行文件旁边的 public/）
COPY --from=frontend-builder /app/dist ./public

USER app
EXPOSE 8000

ENTRYPOINT ["/app/myapi"]
