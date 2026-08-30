import path from "node:path"

/**
 * 运行配置：文件内是本地开发默认值，部署时用同名环境变量覆盖（优先级高于默认值）。
 */
export const config = {
  /** HTTP 监听端口，前端 dev 代理与 Dockerfile 的 EXPOSE 都指向 8000。 */
  port: Number(process.env.PORT ?? 8000),

  database: {
    /**
     * PostgreSQL 连接串。Bun 内置驱动默认不走 TLS，等价于原来的 sslmode=disable，
     * 需要 TLS 时在连接串上加 ?sslmode=require。
     */
    url: process.env.DATABASE_URL ?? "postgres://postgres:REDACTED@localhost:5432/myapi",

    /**
     * 连接池（时间单位为秒）：上限 20、连接最长存活 1 小时、建连超时 10 秒，未列出的项用 Bun 默认值。
     * 池是惰性建连的，没有「最小空闲数」概念；默认空闲连接不回收（idleTimeout 为 0）。
     */
    pool: { max: 20, maxLifetime: 3600, connectionTimeout: 10 },
  },

  /** 前端构建产物目录，镜像构建时由 frontend-builder 阶段填充。 */
  staticDir: process.env.STATIC_DIR ?? path.resolve(import.meta.dir, "../public"),

  log: {
    /**
     * 最低输出级别，pino 的级别名：trace / debug / info / warn / error / fatal。
     * bun test 会把 NODE_ENV 设成 test，此时默认静音，免得请求日志混进测试输出。
     */
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
    /**
     * 输出格式：json 或 pretty。默认看标准输出是不是终端——本地 bun run dev 是终端就用 pretty，
     * 容器里 stdout 接的是日志采集就用 json，不用在两边分别配。
     */
    format: process.env.LOG_FORMAT ?? (process.stdout.isTTY ? "pretty" : "json"),
  },

  holiday: {
    /**
     * 定时刷新节假日数据的间隔（毫秒），默认 24 小时。
     * 数据源一年只更新几次（次年安排公布、临时调休），每天拉一次足够，也不会给数据源造成压力。
     */
    refreshIntervalMs: Number(process.env.HOLIDAY_REFRESH_INTERVAL_MS ?? 24 * 60 * 60 * 1000),
  },
}
