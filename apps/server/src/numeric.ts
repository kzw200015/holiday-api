import { z } from "zod"

/*
 * 从外面进来的数字（路径、查询串、游标、令牌载荷、签名的过期时间）都是字符串，要先认清是不是一串十进制数字再转：
 * `1.5`、`abc`、`0x10`、超出安全整数的都算不合法。
 */

/** 是不是一串落在安全整数范围里的十进制数字。 */
export function isDecimal(text: string): boolean {
  return /^\d{1,16}$/.test(text) && Number.isSafeInteger(Number(text))
}

/** 先认成十进制数字、转成数，再交给给定的规则（正整数、落得进数据库的列）判断，文案也用同一份。 */
export function numeric(schema: z.ZodType<number, number>, message: string) {
  return z.string({ error: message }).refine(isDecimal, message).transform(Number).pipe(schema)
}
