import { z } from "zod"

import { codePointLength } from "./text.js"

const USERNAME_RULE = "用户名只能是 3 到 32 位的字母、数字、下划线或连字符"

/**
 * 注册与登录的请求体。
 *
 * 用户名限制成一眼能认的字符集，因为它会出现在 URL 和日志里；密码只卡长度、不强制复杂度——
 * 强制复杂度反而会逼出「Passw0rd!」这种可预测的密码。长度按码点数：3 个汉字不该算够 8 位。
 */
export const credentialsSchema = z.object({
  username: z.string({ error: USERNAME_RULE }).regex(/^[0-9A-Za-z_-]{3,32}$/, USERNAME_RULE),
  password: z
    .string({ error: "密码至少 8 位" })
    .refine((password) => codePointLength(password) >= 8, "密码至少 8 位")
    .refine((password) => codePointLength(password) <= 128, "密码最长 128 位"),
})

export type Credentials = z.output<typeof credentialsSchema>

/** 当前登录的本站账号 */
export interface CurrentUser {
  id: number
  username: string
}

/** 登录与注册的返回：令牌加用户本身 */
export interface Authenticated {
  token: string
  user: CurrentUser
}

/** 登录页要先知道的站点设置 */
export interface AuthOptions {
  /** 是否开放注册，部署时决定 */
  allowRegistration: boolean
}
