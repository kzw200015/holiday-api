import { zValidator } from "@hono/zod-validator"
import type { ValidationTargets } from "hono"
import type { z } from "zod"

import { badRequest } from "@server/http-error"

/**
 * 按 schema 校验一处入参（请求体、查询串、路径参数）。处理函数拿到的是 schema 的输出（默认值已填上、transform 过），
 * 前端经 hc 推断出的是它的输入，所以 `.default()`、`.transform()` 都能照常用。
 *
 * 不合格时回 400，message 是这组 schema 里的中文文案（去重，不带字段路径：文案本身已经说清了是哪一项），前端直接展示。
 * 这里抛出而不是回一个响应：回响应的话，zod 的错误对象会被推断成每条接口的一种响应，混进前端的类型。
 */
export function validate<Target extends keyof ValidationTargets, T extends z.ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw badRequest([...new Set(result.error.issues.map((issue) => issue.message))])
    }
  })
}
