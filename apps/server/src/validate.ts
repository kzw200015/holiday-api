import { zValidator } from "@hono/zod-validator"
import type { ValidationTargets } from "hono"
import type { z } from "zod"

import { badRequest } from "@server/http-error"

/**
 * 按 schema 校验一处入参（请求体、查询串、路径参数）。处理函数拿到的是 schema 的输出（默认值已填上、transform 过）。
 *
 * 不合格时回 400，message 是这组 schema 里的中文文案（去重，不带字段路径：文案本身已经说清了是哪一项）。
 * 这里抛出而不是回一个响应，由 app.ts 的 onError 统一回成失败的响应体。
 */
export function validate<Target extends keyof ValidationTargets, T extends z.ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw badRequest([...new Set(result.error.issues.map((issue) => issue.message))])
    }
  })
}
