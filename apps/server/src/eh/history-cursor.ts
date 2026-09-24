import { readingHistoryQuerySchema } from "@myapi/shared"
import { z } from "zod"

import { gidParam } from "@/eh/params.js"

/*
 * 阅读历史的游标：上一页最后一条的阅读时间与 gid，拿去和库里的原值比较。
 * 时间列只存到毫秒（见 database/columns.ts），经过 Date 一来一回不丢精度，比较才不会漏行。
 */

export interface HistoryCursor {
  readAt: Date
  gid: number
}

const INVALID = "阅读历史游标不合法"

/* 游标解开后是「ISO 时间,gid」两段 */
const parts = z.tuple([z.iso.datetime().transform((text) => new Date(text)), gidParam])

export function encodeHistoryCursor({ readAt, gid }: HistoryCursor): string {
  return Buffer.from(`${readAt.toISOString()},${gid}`).toString("base64url")
}

/** 阅读历史的查询串，游标解成 HistoryCursor；空游标（第一页）是 null。 */
export const readingHistoryQuery = readingHistoryQuerySchema.transform(({ cursor }, ctx): HistoryCursor | null => {
  if (!cursor) {
    return null
  }
  const parsed = parts.safeParse(Buffer.from(cursor, "base64url").toString().split(","))
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: INVALID })
    return z.NEVER
  }
  const [readAt, gid] = parsed.data
  return { readAt, gid }
})
