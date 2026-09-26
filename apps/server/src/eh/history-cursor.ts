import { z } from "zod"

import { gidParam } from "@server/eh/params"
import { badRequest } from "@server/http-error"

/*
 * 阅读历史的游标：上一页最后一条的阅读时间与 gid，拿去和库里的原值比较。
 * 时间列只存到毫秒（见 database/columns.ts），经过 Date 一来一回不丢精度，比较才不会漏行。
 */

export interface HistoryCursor {
  readAt: Date
  gid: number
}

/** 游标不合法时的文案：查询串不是字符串、解不开，说的都是这一句。 */
export const INVALID_HISTORY_CURSOR = "阅读历史游标不合法"

/* 游标解开后是「ISO 时间,gid」两段 */
const parts = z.tuple([z.iso.datetime().transform((text) => new Date(text)), gidParam])

export function encodeHistoryCursor({ readAt, gid }: HistoryCursor): string {
  return Buffer.from(`${readAt.toISOString()},${gid}`).toString("base64url")
}

/**
 * 解开查询串里的游标；空游标（第一页）是 null，解不开回 400。
 *
 * 不写成查询串 schema 上的 transform：前端按 schema 的输出类型推断要传什么（Eden），那样推出来的就成了要传 HistoryCursor。
 */
export function decodeHistoryCursor(cursor: string): HistoryCursor | null {
  if (!cursor) {
    return null
  }
  const parsed = parts.safeParse(Buffer.from(cursor, "base64url").toString().split(","))
  if (!parsed.success) {
    throw badRequest(INVALID_HISTORY_CURSOR)
  }
  const [readAt, gid] = parsed.data
  return { readAt, gid }
}
