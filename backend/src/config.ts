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
}
