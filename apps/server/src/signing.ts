/**
 * 按用途从主密钥派生的子密钥：SHA-256(主密钥原文 + ":" + 用途标签)。
 *
 * 全局只配一把主密钥，但登录令牌与图片地址签名是两种用途：共用同一把裸密钥的话，任何一处的实现缺陷都会波及另一处。
 * 两把摆在这一处派生，业务代码只拿子密钥。算法与用途标签是已签发令牌和已发出图片地址的一部分，改了等于换密钥，
 * 所有人要重新登录、所有图片地址一起失效。
 */
export interface SigningKeys {
  token: Buffer
  attachment: Buffer
}

/** 只有这里读主密钥。 */
export function deriveSigningKeys(secret: string): SigningKeys {
  return { token: derive(secret, "token-v1"), attachment: derive(secret, "attachment-v1") }
}

function derive(secret: string, purpose: string): Buffer {
  return new Bun.CryptoHasher("sha256").update(`${secret}:${purpose}`).digest()
}
