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

    /**
     * 迁移文件目录，由 drizzle-kit 从模型生成，进程启动时应用。
     * 镜像里 src 在 /app/src、迁移在 /app/drizzle，和仓库里的相对位置一致。
     */
    migrationsDir: process.env.MIGRATIONS_DIR ?? path.resolve(import.meta.dirname, "../drizzle"),
  },

  /** 前端构建产物目录，镜像构建时由 frontend-builder 阶段填充。 */
  staticDir: process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, "../public"),

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

  security: {
    /**
     * 主密钥，会话 Cookie 签名与 e 站 Cookie 加密都由它派生出各自的子密钥（见 crypto/secretBox.ts）。
     *
     * 这一项故意没有可用的默认值：数据库口令泄露只影响这一个库，而签名密钥泄露意味着任何人
     * 都能伪造任意用户的会话。为空时 index.ts 会拒绝启动。用 `openssl rand -hex 32` 生成。
     */
    secretKey: process.env.EH_SECRET_KEY ?? "",

    /**
     * 是否开放注册。公网部署时任何人注册即可借这台机器代理 e 站流量，被封的是本机出口 IP，
     * 所以要留一个关掉的开关；默认开着是因为不开就没法创建第一个账号。
     */
    allowRegistration: (process.env.ALLOW_REGISTRATION ?? "true") === "true",

    /** 会话 Cookie 是否只在 HTTPS 下发送。本地开发走 http，默认关；部署到 HTTPS 后置 true。 */
    cookieSecure: process.env.COOKIE_SECURE === "true",

    /** 会话有效期（毫秒），默认 30 天。签名载荷里带过期时间，服务端不存会话。 */
    sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? 30 * 24 * 60 * 60 * 1000),

    /**
     * 除同源外还允许发起写请求的来源（CSRF 校验用），逗号分隔。
     * 默认为空：开发时前端经 vite 代理访问，代理已经把 Origin 改写成后端自己的地址（见 vite.config.ts），
     * 所以本来就是同源；只有把前端单独部署到别的域名下才需要配这一项。
     */
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
  },

  eh: {
    /**
     * 请求 e 站时伪装的 User-Agent。Bun 的 fetch 默认发 `Bun/1.x`，
     * 在一个明确禁止自动化抓取的站点上等于举手，必须换成真实浏览器的 UA。
     */
    userAgent:
      process.env.EH_USER_AGENT ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

    /** 单次请求的总超时（毫秒）。e 站页面偶尔很慢，但超过 30 秒基本就是不通了。 */
    requestTimeoutMs: Number(process.env.EH_REQUEST_TIMEOUT_MS ?? 30_000),

    /**
     * HTML 通道（e-hentai.org / exhentai.org 页面）相邻请求的最小间隔与随机抖动（毫秒）。
     * 抖动是为了不呈现出机器般规律的请求节奏。
     */
    htmlMinIntervalMs: Number(process.env.EH_HTML_MIN_INTERVAL_MS ?? 1000),
    htmlJitterMs: Number(process.env.EH_HTML_JITTER_MS ?? 200),

    /**
     * API 通道（api.e-hentai.org）的令牌桶，对齐官方口径「连续 4-5 个请求后要等约 5 秒」。
     */
    apiBurst: Number(process.env.EH_API_BURST ?? 4),
    apiWindowMs: Number(process.env.EH_API_WINDOW_MS ?? 5000),

    /**
     * 图片通道（*.hath.network / ehgt.org）的并发上限。
     * H@H 是分布式 CDN，本就是给浏览器并发拉的，不参与上面两条节流，
     * 否则一屏 20 张缩略图会排成 20 秒。
     */
    imageConcurrency: Number(process.env.EH_IMAGE_CONCURRENCY ?? 4),

    /**
     * 熔断冷却时长（毫秒）。一旦识别出 IP 被封或配额超限就整体停手这么久，
     * 不然会继续以 1 req/s 敲门，把临时封禁续成长期封禁。
     */
    banCooldownMs: Number(process.env.EH_BAN_COOLDOWN_MS ?? 10 * 60 * 1000),
  },
}
