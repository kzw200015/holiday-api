import { z } from "zod"

/*
 * 全部配置都来自环境变量，在本模块被导入时校验一次，缺了或写错进程直接拒绝启动。本地开发写在 apps/server/.env 里
 * （已被 Git 忽略；Bun 启动时就会把当前目录的 .env 读进环境变量），部署时由容器环境给出。清单见 .env.example。
 */

/** 每个单位合多少毫秒 */
const DURATION_UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

/** 时长写成 30d、24h、30s、500ms 这样的「整数 + 单位」，解析成毫秒。 */
const duration = z.string().transform((text, ctx) => {
  const [, amount, unit] = /^(\d+)(ms|s|m|h|d)$/.exec(text) ?? []
  const factor = unit === undefined ? undefined : DURATION_UNITS[unit]
  if (amount === undefined || factor === undefined) {
    ctx.addIssue({ code: "custom", message: "时长要写成整数加单位，如 30d、24h、30s、500ms" })
    return z.NEVER
  }
  return Number(amount) * factor
})

const envSchema = z.object({
  DATABASE_URL: z.string({ error: "缺少 DATABASE_URL，形如 postgres://用户:口令@主机:5432/库名" }).min(1),
  /**
   * 出网请求（节假日数据源）一律带的 User-Agent，默认是一个真实桌面浏览器的：默认的 UA 容易被当成爬虫拦下。
   * 名字带 EH_ 是沿用下来的，改名要动已有部署的环境变量；超时的 EH_REQUEST_TIMEOUT 同理。
   */
  EH_USER_AGENT: z
    .string()
    .min(1)
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    ),
  /** 单次出网请求的超时：等响应头最多这么久，之后按「多久没收到一个字节」算，不限整个响应传多久。 */
  EH_REQUEST_TIMEOUT: duration.prefault("30s"),
  /** Dockerfile 的 EXPOSE 指向 8000 */
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
})

type Env = z.output<typeof envSchema>

/** 校验环境变量：失败时把每一项的问题列出来。 */
function validateEnv(env: Record<string, unknown>): Env {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    throw new Error(`环境变量有误：\n${problems.join("\n")}`)
  }
  return result.data
}

/** 校验过的配置。用到它的模块在顶层取成常量，所以环境变量要在导入应用之前就备齐（测试也一样）。 */
export const env = validateEnv(process.env)
