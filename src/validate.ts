import { zValidator } from "@hono/zod-validator"
import type { ValidationTargets } from "hono"
import { HTTPException } from "hono/http-exception"
import type { z } from "zod"

/**
 * 按 schema 校验一处入参（查询串、路径参数、请求体）。处理函数经 `c.req.valid(…)` 拿到的是 schema 的输出（默认值已填上、transform 过）。
 *
 * 不合格时回 400，message 是这组 schema 里的中文文案，去重后用「；」连成一句（不带字段路径：文案本身已经说清了是哪一项）。
 * 这里抛出而不是回一个响应，由 app.ts 的 onError 统一回成 `{code, message}`。
 */
export function validate<Target extends keyof ValidationTargets, T extends z.ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const message = [...new Set(result.error.issues.map((issue) => issue.message))].join("；")
      throw new HTTPException(400, { message })
    }
  })
}
