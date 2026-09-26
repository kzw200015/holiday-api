import { env } from "@server/config"

/*
 * 按用途从主密钥派生的子密钥：SHA-256(主密钥原文 + ":" + 用途标签)。只有这里读主密钥。
 *
 * 全局只配一把主密钥，但登录令牌与图片地址签名是两种用途：共用同一把裸密钥的话，任何一处的实现缺陷都会波及另一处。
 * 两把摆在这一处派生，业务代码只拿子密钥。算法与用途标签是已签发令牌和已发出图片地址的一部分，改了等于换密钥，
 * 所有人要重新登录、所有图片地址一起失效。
 */

/** 登录令牌的签名子密钥 */
export const tokenKey = derive("token-v1")

/** 图片地址的签名子密钥 */
export const attachmentKey = derive("attachment-v1")

function derive(purpose: string): Buffer {
  return new Bun.CryptoHasher("sha256").update(`${env.SECRET_KEY}:${purpose}`).digest()
}
