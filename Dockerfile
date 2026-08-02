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
FROM golang:1.26-alpine AS backend-builder

WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
# 前端产物放入 go:embed 目录，随二进制一起编译进最终镜像
COPY --from=frontend-builder /app/dist ./internal/web/dist

# 静态链接，便于在精简运行时镜像中执行
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---------- 运行时 ----------
FROM alpine:3.22

# ca-certificates 用于访问 HTTPS 数据源，tzdata 支持通过 TZ 环境变量指定时区
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 app

WORKDIR /app
# 前端资源已内嵌，运行时只需这一个二进制
COPY --from=backend-builder /out/server ./server

USER app
EXPOSE 8000

CMD ["./server"]
