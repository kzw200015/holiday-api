import argon2 from "argon2"

/*
 * argon2id 密码哈希，存成 PHC 串。参数显式写死：argon2 包的默认值（t=3、p=4）与库里已有的哈希不同，
 * 虽然校验时参数从串里读、旧哈希照样验得过，新旧账号的哈希成本还是保持一致为好。单次校验约 40 毫秒、占 64 MiB。
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const

/** 账号不存在时拿它顶上，好让校验耗时与真实账号一致，响应快慢不泄露哪些用户名存在。 */
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$V3RDOUgDvIfDcjYEAIfghw$944XZMEceic4XWjgEwTPbYVHWIVkGO7WIRJgSrzMMgY"

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS)
}

/** 核对密码。账号不存在时传 null：照样算一遍再回 false。哈希串坏了只当作不匹配。 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  try {
    const matches = await argon2.verify(hash ?? DUMMY_HASH, password)
    return matches && hash !== null
  } catch {
    return false
  }
}
