import { zValidator } from "@hono/zod-validator"
import type { ValidationTargets } from "hono"
import type { z } from "zod"
import { badRequest } from "../apiresponse/apiResponse"

/**
 * 请求参数校验：包一层 zValidator，把校验失败统一转成 ApiResponse 结构的 400，
 * 文案取第一条 issue 的 message（schema 里用 { error } 定制），而不是 zod-validator 默认的原始错误对象。
 */
export function apiValidator<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(badRequest(result.error.issues[0]?.message ?? "参数格式错误"), 400)
    }
  })
}
