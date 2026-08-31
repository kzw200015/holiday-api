/**
 * 按用途从主密钥派生一把十六进制子密钥。
 *
 * 全局只配一把主密钥（EH_SECRET_KEY），但登录令牌签名和图片地址签名是两种不同用途。
 * 直接共用同一把裸密钥的话，任何一处的实现缺陷都会波及另一处，所以统一先按用途派生。
 *
 * 派生规则只有这一份：写成两份的话，两边的拼法哪天不一致，同一个用途就会派生出两把不同的密钥，
 * 表现是「重启后所有令牌和图片地址一起失效」。两个用途的派生都写在 index.ts 里，
 * 摆在一起才看得出有没有谁直接拿了裸主密钥。
 */
export function deriveSecret(secretKey: string, purpose: string): string {
  return new Bun.CryptoHasher("sha256").update(`${secretKey}:${purpose}`).digest("hex")
}
