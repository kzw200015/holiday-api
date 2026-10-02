import ms, { type StringValue } from "ms"
import { z } from "zod"

/*
 * 全部配置都来自环境变量，在本模块被导入时校验一次，缺了或写错进程直接拒绝启动。本地开发写在根目录的 .env 里
 * （已被 Git 忽略；Bun 启动时就会把当前目录的 .env 读进环境变量），部署时由容器环境给出。清单见 .env.example。
 */

/** 时长按 ms 的写法（30s、500ms、5m；光写数字是毫秒），解析成毫秒；解不开或不是正数的不收。 */
const duration = z.string().transform((text, ctx) => {
  const value = ms(text as StringValue)
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    ctx.addIssue({ code: "custom", message: "时长要写成数字加单位，如 30s、500ms、5m" })
    return z.NEVER
  }
  return value
})

const envSchema = z.object({
  DATABASE_URL: z.string({ error: "缺少 DATABASE_URL，形如 postgres://用户:口令@主机:5432/库名" }).min(1),
  /** 出网请求（节假日数据源）一律带的 User-Agent。GitHub 对默认 UA 不友好，换成真实浏览器的。 */
  OUTBOUND_USER_AGENT: z
    .string()
    .min(1)
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    ),
  /** 单次出网请求的超时：等响应头最多这么久，之后按「多久没收到一个字节」算。 */
  OUTBOUND_TIMEOUT: duration.prefault("30s"),
  /** 日志级别，低于它的不输出。 */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
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
