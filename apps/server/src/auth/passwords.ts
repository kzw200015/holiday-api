/*
 * argon2id 密码哈希，存成 PHC 串，用 Bun 自带的实现。参数显式写死，与库里已有的哈希一致（m=64 MiB、t=2、p=1），
 * 虽然校验时参数从串里读、旧哈希照样验得过，新旧账号的哈希成本还是保持一致为好。单次校验约 40 毫秒、占 64 MiB。
 */
const OPTIONS = { algorithm: "argon2id", memoryCost: 64 * 1024, timeCost: 2 } as const

/** 账号不存在时拿它顶上，好让校验耗时与真实账号一致，响应快慢不泄露哪些用户名存在。 */
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$V3RDOUgDvIfDcjYEAIfghw$944XZMEceic4XWjgEwTPbYVHWIVkGO7WIRJgSrzMMgY"

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, OPTIONS)
}

/** 核对密码。账号不存在时传 null：照样算一遍再回 false。哈希串坏了只当作不匹配。 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  try {
    const matches = await Bun.password.verify(password, hash ?? DUMMY_HASH)
    return matches && hash !== null
  } catch {
    return false
  }
}
