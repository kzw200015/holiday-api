import { utf8Length } from "@myapi/shared"
import { z } from "zod"

/*
 * 全部配置都来自环境变量，启动时校验一次，缺了或写错进程直接拒绝启动。本地开发写在 apps/server/.env 里
 * （@nestjs/config 默认读取当前目录的 .env，已被 Git 忽略），部署时由容器环境给出。清单见 .env.example。
 */

const DURATION_UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const

/** 时长写成 30d、24h、30s、500ms 这样的「整数 + 单位」，解析成毫秒。 */
const duration = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, "时长要写成整数加单位，如 30d、24h、30s、500ms")
  .transform((text) => {
    const [, amount, unit] = /^(\d+)(ms|s|m|h|d)$/.exec(text)!
    return Number(amount) * DURATION_UNITS[unit as keyof typeof DURATION_UNITS]
  })

const envSchema = z.object({
  DATABASE_URL: z.string({ error: "缺少 DATABASE_URL，形如 postgres://用户:口令@主机:5432/库名" }).min(1),
  /**
   * 主密钥，登录令牌与图片地址的签名密钥都由它派生，只由 SigningKeys 读取。
   *
   * 故意没有默认值：数据库口令泄露只影响这一个库，签名密钥泄露则意味着任何人都能伪造任意账号的令牌。
   * 太短时拒绝启动：拿到一个令牌就能离线猜密钥，短密钥猜得出来。
   */
  SECRET_KEY: z
    .string({ error: "缺少 SECRET_KEY，用 `openssl rand -hex 32` 生成一个再启动" })
    .refine((key) => utf8Length(key) >= 32, "SECRET_KEY 至少要 32 字节，用 `openssl rand -hex 32` 生成一个再启动"),
  /**
   * 是否开放注册，默认关闭。公网部署时任何人注册即可借这台机器代理 e 站流量，而且 e 站凭据是明文入库的，
   * 账号越少、越都是自己人，这个取舍才成立。建第一个账号：临时打开、注册完再关回去重启。
   */
  ALLOW_REGISTRATION: z.stringbool().default(false),
  /** 登录令牌有效期。令牌无状态，服务端不存已签发的令牌，所以没法提前作废。 */
  TOKEN_TTL: duration.prefault("30d"),
  /** 请求 e 站时伪装的 User-Agent。默认的 UA 在一个明确禁止自动化抓取的站点上等于举手，必须换成真实浏览器的。 */
  EH_USER_AGENT: z
    .string()
    .min(1)
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    ),
  /** 单次请求 e 站的超时：等响应头最多这么久，之后按「多久没收到一个字节」算，不限整张图传多久。 */
  EH_REQUEST_TIMEOUT: duration.prefault("30s"),
  /**
   * 签名图片地址的有效期。这类地址给 <img> 用，带不了 Authorization 头，只能靠签名认身份；
   * 一旦被转发出去，有效期内谁都能打开，所以别设太长。过期表现为图片裂开，重进详情页就会拿到新签的地址。
   */
  ATTACHMENT_TTL: duration.prefault("24h"),
  /** 前端开发代理与 Dockerfile 的 EXPOSE 都指向 8000 */
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
})

export type Env = z.output<typeof envSchema>

/** 交给 ConfigModule 的校验函数：失败时把每一项的问题列出来。 */
export function validateEnv(env: Record<string, unknown>): Env {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    throw new Error(`环境变量有误：\n${problems.join("\n")}`)
  }
  return result.data
}
