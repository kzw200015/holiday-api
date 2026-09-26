import { z } from "zod"

import { codePointLength } from "./text"

const USERNAME_RULE = "用户名只能是 3 到 32 位的字母、数字、下划线或连字符"

/**
 * 注册的请求体。
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

const LOGIN_REQUIRED = "请填写用户名和密码"

/**
 * 登录的请求体，只要求两项都是字符串。用户名与密码的规则是注册时的事：不合规的输入本来就对不上任何账号，
 * 登录再卡一遍，只会让输错的人看到注册规则而不是「用户名或密码错误」，规则收紧后还会把早先注册的账号挡在门外。
 */
export const loginSchema = z.object({
  username: z.string({ error: LOGIN_REQUIRED }),
  password: z.string({ error: LOGIN_REQUIRED }),
})
