# 构建：编出 musl 的静态二进制，迁移（sqlx::migrate!）与北京时区（jiff 的 tz::get!）都编进去。
# 镜像标签与 rust-toolchain.toml 一起升；测试要起 Testcontainers，镜像构建里没有 Docker，测试在提交前本地跑
FROM rust:1.98-alpine AS build

WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY migrations migrations
COPY src src
# cargo 的下载与编译缓存挂成构建缓存，改代码不必从头编依赖
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked && cp target/release/myapi /myapi

# 运行：只有这一个可执行文件。distroless 的 static 镜像自带 CA 证书，以非 root 用户运行
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /myapi /myapi
EXPOSE 8000
# 配置全走环境变量，清单见 .env.example；启动时自动执行数据库迁移
ENTRYPOINT ["/myapi"]
