import { eq } from "drizzle-orm"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import { logger } from "../logger"
import { TtlCache } from "./ehCache"
import type { EhClient, EhRequestContext } from "./ehClient"
import { type EhCookie, ehCookieSchema, ehCredentialTable, type EhSite } from "./ehModels"

/** 解密并校验过的用户凭据。 */
interface BoundCredential {
  credential: EhCookie
  memberId: string
  hasExAccess: boolean
}

export interface CredentialStatus {
  bound: boolean
  /** 未绑定时为空串。 */
  memberId: string
  hasExAccess: boolean
}

/**
 * 用户的 e 站凭据：入库、取出、以及据此决定一次请求走前站还是里站。
 *
 * 从 EhService 里分出来是因为这件事有自己的一套关注点（缓存失效、站点降级），
 * 跟搜索、取图那些编排逻辑没有交集；分开之后 EhService 只需要「给我一个请求上下文」。
 *
 * 凭据以 JSON 明文入库，不加密——理由和代价见 ehModels.ts 里 ehCredentialTable 的说明。
 * 也因此没有任何「读不出来就当未绑定」的兜底：那一列的内容只由 bind() 写入。
 */
export class EhCredentialStore {
  private readonly db: BunSQLDatabase
  private readonly ehClient: Pick<EhClient, "verifyCredential">

  /**
   * 已取出的凭据。图片代理是全系统请求最密集的接口，每张图都为它查一次库太浪费。
   *
   * 存的是 Promise 而不是结果：阅读器一进页面就并发发出四五个请求，存结果的话它们
   * 全都在第一次查询落地之前判定未命中，同一个用户于是被查库四五遍。
   * 绑定解绑时手动失效，TTL 和容量上限只是兜底，免得离开的用户一直占着位置。
   */
  private readonly cache = new TtlCache<number, Promise<BoundCredential | null>>({
    ttlMs: 30 * 60 * 1000,
    maxEntries: 1000,
  })

  constructor({ db, ehClient }: { db: BunSQLDatabase; ehClient: Pick<EhClient, "verifyCredential"> }) {
    this.db = db
    this.ehClient = ehClient
  }

  /** 绑定状态。不返回明文 Cookie。 */
  async status(userId: number): Promise<CredentialStatus> {
    const bound = await this.load(userId)
    return {
      bound: bound !== null,
      memberId: bound?.memberId ?? "",
      hasExAccess: bound?.hasExAccess ?? false,
    }
  }

  /** 保存前先拿这组 Cookie 实际请求一次，无效就别入库，免得事后一脸茫然。 */
  async bind(
    userId: number,
    cookie: EhCookie,
  ): Promise<{ ok: true; status: CredentialStatus } | { ok: false; msg: string }> {
    const { valid, hasExAccess } = await this.ehClient.verifyCredential(cookie)
    if (!valid) {
      return { ok: false, msg: "这组 Cookie 用不了，确认一下是否复制完整、是否已经过期" }
    }

    const serialized = JSON.stringify(cookie)
    await this.db
      .insert(ehCredentialTable)
      .values({ userId, memberId: cookie.ipbMemberId, cookie: serialized, hasExAccess })
      .onConflictDoUpdate({
        target: ehCredentialTable.userId,
        set: { memberId: cookie.ipbMemberId, cookie: serialized, hasExAccess },
      })
    this.cache.delete(userId)

    logger.info({ userId, hasExAccess }, "已绑定 e 站凭据")
    return { ok: true, status: { bound: true, memberId: cookie.ipbMemberId, hasExAccess } }
  }

  async unbind(userId: number): Promise<void> {
    await this.db.delete(ehCredentialTable).where(eq(ehCredentialTable.userId, userId))
    this.cache.delete(userId)
  }

  /**
   * 组一次请求的上下文。
   * 有里站权限就默认走里站（内容是前站的超集），调用方显式要前站时才降级。
   */
  async requestContext(userId: number, requested?: EhSite): Promise<EhRequestContext> {
    const bound = await this.load(userId)
    const best: EhSite = bound?.hasExAccess ? "ex" : "e"
    return { credential: bound?.credential ?? null, site: requested === "e" ? "e" : best }
  }

  private load(userId: number): Promise<BoundCredential | null> {
    const cached = this.cache.get(userId)
    if (cached) {
      return cached
    }

    // 查库失败不能留在缓存里：那样一次数据库抖动会把这个用户钉死到 TTL 到期
    const task = this.read(userId).catch((err: unknown) => {
      this.cache.delete(userId)
      throw err
    })
    this.cache.set(userId, task)
    return task
  }

  private async read(userId: number): Promise<BoundCredential | null> {
    const rows = await this.db.select().from(ehCredentialTable).where(eq(ehCredentialTable.userId, userId)).limit(1)
    const row = rows[0]
    if (!row) {
      return null
    }

    // cookie 列只由上面的 bind() 写入，内容一定是 ehCookieSchema 序列化出来的 JSON，
    // 所以这里不兜底：真解析不出来说明有人手工改过库，那该让它抛出去，
    // 而不是静默显示成「未绑定」——后者查起来毫无线索。
    // parse 顺带把 unknown 收窄成 EhCookie，省掉一个 as 断言
    return {
      credential: ehCookieSchema.parse(JSON.parse(row.cookie) as unknown),
      memberId: row.memberId,
      hasExAccess: row.hasExAccess,
    }
  }
}
