import type { EhCredential } from "@myapi/shared/eh"

/** 表站与里站。里站内容是表站的超集，只有带里站权限的 e 站凭据才进得去。 */
export type Site = "e" | "ex"

export const SITES = {
  e: { page: "https://e-hentai.org", api: "https://api.e-hentai.org/api.php" },
  ex: { page: "https://exhentai.org", api: "https://s.exhentai.org/api.php" },
} as const satisfies Record<Site, { page: string; api: string }>

/** 一次上游请求的身份与站点。没绑凭据时匿名访问表站。 */
export interface EhAccess {
  credential: EhCredential | null
  site: Site
  /**
   * 缓存作用域：同一份上游身份可以共享页面，换绑任一 Cookie 后自然进入新的作用域。
   * 只保存摘要，不保存也不输出凭据明文。
   */
  scope: string
}

export function accessOf(credential: EhCredential | null, site: Site): EhAccess {
  const digest = credential
    ? new Bun.CryptoHasher("sha256")
        .update(`${credential.ipbMemberId}\n${credential.ipbPassHash}\n${credential.igneous}`)
        .digest("hex")
    : ""
  return { credential, site, scope: `${site}:${digest}` }
}

export const ANONYMOUS = accessOf(null, "e")

/**
 * 每个页面与接口请求都带的 Cookie：固定的两项加上用户自己的。
 * nw=1 跳过被标记图集的内容警告插页；sl=dm_2 把搜索结果锁定成 Compact 模式，免得账号的显示设置把列表结构换掉。
 */
export function cookieHeader(credential: EhCredential | null): string {
  const cookies = ["nw=1", "sl=dm_2"]
  if (credential) {
    cookies.push(`ipb_member_id=${credential.ipbMemberId}`, `ipb_pass_hash=${credential.ipbPassHash}`)
    if (credential.igneous) {
      cookies.push(`igneous=${credential.igneous}`)
    }
  }
  return cookies.join("; ")
}
