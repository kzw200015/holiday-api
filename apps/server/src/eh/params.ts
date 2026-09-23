import { galleryTokenSchema, gidSchema, pageSchema } from "@myapi/shared"
import { z } from "zod"

/*
 * 路径与查询串里的参数都是字符串，数字要先认清是不是一串十进制数字再转：`1.5`、`abc`、`0x10`、超出安全整数的都算不合法，
 * 转完再交给共享的规则（正整数、落得进数据库的列）判断，文案也用同一份。
 */
function numeric(schema: z.ZodType<number, number>, message: string) {
  return z.string({ error: message }).refine(isDecimal, message).transform(Number).pipe(schema)
}

/** 是不是一串落在安全整数范围里的十进制数字。外面来的数字（路径、查询串、游标、签名的过期时间）都先过这一道。 */
export function isDecimal(text: string): boolean {
  return /^\d{1,16}$/.test(text) && Number.isSafeInteger(Number(text))
}

export const gidParam = numeric(gidSchema, "图集编号不合法")

export const galleryParams = z.object({ gid: gidParam, token: galleryTokenSchema })

export const galleryPageParams = galleryParams.extend({ page: numeric(pageSchema, "页码不合法") })

const signature = z.string({ error: "图片地址缺少签名参数" }).min(1, "图片地址缺少签名参数")

/** 大图地址的查询串：uid 是签发给谁的，e 与 s 是签名。 */
export const galleryImageQuery = z.object({
  uid: numeric(z.int().positive(), "用户标识不合法"),
  e: signature,
  s: signature,
})

/** 缩略图地址的查询串：u 是编码过的上游地址。 */
export const thumbnailQuery = z.object({
  u: z.string({ error: "缺少缩略图地址" }).min(1, "缺少缩略图地址"),
  e: signature,
  s: signature,
})
