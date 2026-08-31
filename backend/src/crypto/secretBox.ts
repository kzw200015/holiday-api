/**
 * 需要还原出原文的秘密（目前只有用户绑定的 e 站 Cookie）在入库前用 AES-GCM 加密。
 *
 * 全局只配一把主密钥，但登录令牌签名、e 站 Cookie 加密、图片地址签名是三种不同用途。
 * 直接共用同一把裸密钥的话，任何一处的实现缺陷都会波及另外两处，所以统一先按用途派生子密钥。
 */

/** AES-GCM 的 IV 长度，GCM 标准推荐 96 位。 */
const IV_BYTES = 12

/**
 * base64 解码成 WebCrypto 能接受的字节数组。
 * 这里要再包一层 Uint8Array：Buffer 的底层缓冲区类型是 ArrayBufferLike，
 * 而 crypto.subtle 只收 ArrayBuffer 支撑的视图，直接传 Buffer 过不了类型检查。
 */
function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(text, "base64"))
}

/**
 * 按用途从主密钥派生一把十六进制子密钥。
 *
 * 派生规则只有这一份：写成两份的话，两边的拼法哪天不一致，
 * 同一个用途就会派生出两把不同的密钥，表现是「所有已存的凭据突然解不开」。
 * 三个用途的派生都写在 index.ts 里，摆在一起才看得出有没有谁漏了。
 */
export function deriveSecret(secretKey: string, purpose: string): string {
  return new Bun.CryptoHasher("sha256").update(`${secretKey}:${purpose}`).digest("hex")
}

/**
 * AES-GCM 加解密器。收的是已经按用途派生好的子密钥，跟 JwtAuth、AttachmentSigner 一致——
 * 它们三个当中只要有一个自己在内部派生，「谁用了哪个用途标签」就散成了两处，
 * 而漏派生这件事编译期看不出来，运行起来也一切正常。
 */
export class SecretBox {
  /** 密钥导入是异步的但结果不变，导入一次后复用同一个 Promise，避免每次加解密都重新导入。 */
  private readonly key: Promise<CryptoKey>

  constructor(subkey: string) {
    const raw = new Uint8Array(Buffer.from(subkey, "hex"))
    this.key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
  }

  /** 加密成 `base64(iv):base64(密文)`。IV 每次随机，所以同样的明文两次加密结果不同。 */
  async seal(plain: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await this.key, new TextEncoder().encode(plain))
    return `${Buffer.from(iv).toString("base64")}:${Buffer.from(cipher).toString("base64")}`
  }

  /**
   * 解密。格式不对、密文被篡改、主密钥换过都会抛错——
   * GCM 自带完整性校验，这里不需要额外的校验和。调用方一律按「凭据不可用，请重新绑定」处理。
   */
  async open(sealed: string): Promise<string> {
    const [ivText, cipherText] = sealed.split(":")
    if (!ivText || !cipherText) {
      throw new Error("密文格式错误，应为 base64(iv):base64(密文)")
    }
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(ivText) },
      await this.key,
      decodeBase64(cipherText),
    )
    return new TextDecoder().decode(plain)
  }
}
