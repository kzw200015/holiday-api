import { z } from "zod"

import { gidParam } from "@server/eh/params"

/*
 * 阅读历史的游标：上一页最后一条的阅读时间与 gid，拿去和库里的原值比较。
 * 时间列只存到毫秒（见 database/columns.ts），经过 Date 一来一回不丢精度，比较才不会漏行。
 */

export interface HistoryCursor {
  readAt: Date
  gid: number
}

/* 游标不合法时的文案：查询串不是字符串、解不开，说的都是这一句 */
const INVALID_HISTORY_CURSOR = "阅读历史游标不合法"

/* 游标解开后是「ISO 时间,gid」两段 */
const parts = z.tuple([z.iso.datetime().transform((text) => new Date(text)), gidParam])

export function encodeHistoryCursor({ readAt, gid }: HistoryCursor): string {
  return Buffer.from(`${readAt.toISOString()},${gid}`).toString("base64url")
}

/** 查询串里的游标，校验时就解开：省略或空串（第一页）是 null，解不开回 400。前端照旧只看到一个字符串。 */
export const historyCursorSchema = z
  .string({ error: INVALID_HISTORY_CURSOR })
  .default("")
  .transform((cursor, context): HistoryCursor | null => {
    if (!cursor) {
      return null
    }
    const parsed = parts.safeParse(Buffer.from(cursor, "base64url").toString().split(","))
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: INVALID_HISTORY_CURSOR })
      return z.NEVER
    }
    const [readAt, gid] = parsed.data
    return { readAt, gid }
  })
