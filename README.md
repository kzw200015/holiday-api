# holiday-api

中国节假日查询 API：给一个日期，回答这天是不是休息日、属于哪个节假日。

法定假日与调休按国家公布的安排算，不在安排里的日期按周末判断；「今天」按北京时间算，不跟着服务器的时区走。节假日安排来自 [holiday-cn](https://github.com/NateScarlet/holiday-cn)，存进 PostgreSQL，启动时拉一次，之后每天北京时间 4:30 刷新当年与次年。

## 接口

两条接口的参数一样：`date` 写成 `YYYY-MM-DD`，省略时查北京时间的今天。

`GET /api/holiday/is-holiday`：只回是不是休息日，响应体就是一个 JSON 布尔值。

```bash
$ curl 'http://localhost:8000/api/holiday/is-holiday?date=2026-01-01'
true
```

`GET /api/holiday/detail`：是不是休息日，外加节假日名称；不在安排里的日期名称为空串。调休上班的日子 `isOffDay` 为 `false`，名称是它所属的节假日。

```bash
$ curl 'http://localhost:8000/api/holiday/detail?date=2026-01-04'
{"date":"2026-01-04","isOffDay":false,"name":"元旦"}
```

失败时回 `{"code": 状态码, "message": "一句中文说明"}`，如日期写错回 400。

## 部署

用 Docker Compose 连同 PostgreSQL 一起起。服务启动时会自动执行迁移，不用手工建表。

新建一个目录，放入 `compose.yaml`：

```yaml
services:
  app:
    image: kzw200015/holiday-api
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgres://holiday_api:${POSTGRES_PASSWORD}@db:5432/holiday_api
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: holiday_api
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: holiday_api
    volumes:
      - db-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U holiday_api -d holiday_api"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  db-data:
```

在同一目录生成 `.env` 存放数据库口令（Compose 会自动读取），然后启动：

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env
docker compose up -d
```

首次启动要先拉到今年的节假日安排才开始监听，拉不到就拒绝启动；之后库里有数据，数据源暂时连不上也照常起来。数据源在 GitHub 上，服务器连 GitHub 不顺的话设 `HTTPS_PROXY`。已有 PostgreSQL 的话可以去掉 `db` 服务，把 `DATABASE_URL` 指向自己的数据库，数据库账号要有建表、改表的权限。

升级：`docker compose pull && docker compose up -d`。

| 环境变量              | 默认值        | 说明                                                 |
| --------------------- | ------------- | ---------------------------------------------------- |
| `DATABASE_URL`        | 必填          | PostgreSQL 连接串                                    |
| `OUTBOUND_TIMEOUT`    | `30s`         | 拉取节假日数据的超时，等到响应头之后按多久没收到数据算 |
| `OUTBOUND_USER_AGENT` | 桌面版 Chrome | 拉取节假日数据用的 User-Agent                        |
| `HTTPS_PROXY`         | 无            | 拉取节假日数据走的代理                               |
| `LOG_LEVEL`           | `info`        | 日志级别                                             |
| `PORT`                | `8000`        | 监听端口                                             |

健康检查：`/api/health/live`（进程存活）、`/api/health/ready`（数据库可用）。

## 开发

需要 [Bun](https://bun.sh) 与 PostgreSQL；跑测试还需要 Docker。

```bash
bun install
cp .env.example .env   # 填 DATABASE_URL
bun run dev            # 监听 :8000
```

常用命令：`bun run test`、`bun run typecheck`、`bun run lint`、`bun run format`。

技术栈：Hono + Drizzle + PostgreSQL，由 Bun 直接运行 TypeScript 源码。项目结构与约定见 [AGENTS.md](AGENTS.md)，领域术语见 [CONTEXT.md](CONTEXT.md)，架构决策见 [docs/adr](docs/adr)。

## 许可证

[MIT](LICENSE)
