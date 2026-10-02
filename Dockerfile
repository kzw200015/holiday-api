# 构建：编出静态链接的二进制，迁移 SQL 经 embed 编进去。
# 镜像标签与 go.mod 的 go 版本一起升；测试要起 Testcontainers，镜像构建里没有 Docker，测试在提交前本地跑
FROM golang:1.27-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
COPY cmd cmd
COPY internal internal
COPY migrations migrations
# 模块下载与编译缓存挂成构建缓存，改代码不必重新下依赖
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /myapi ./cmd/myapi

# 运行：只有这一个可执行文件。distroless 的 static 镜像自带 CA 证书，以非 root 用户运行
FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /myapi /myapi
EXPOSE 8000
# 配置全走环境变量，清单见 .env.example；启动时自动执行数据库迁移
ENTRYPOINT ["/myapi"]
