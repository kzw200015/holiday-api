import type { CredentialStatus, EhCredential } from "@myapi/shared/eh"
import { Inject, Injectable, Logger } from "@nestjs/common"
import { eq, sql } from "drizzle-orm"

import { DATABASE, type Database } from "@/database/database.module"
import { ehCredentials } from "@/eh/eh.tables"
import { accessOf, ANONYMOUS, type EhAccess, type Site } from "@/eh/upstream/access"
import { EhClient } from "@/eh/upstream/eh-client"

const UNBOUND: CredentialStatus = { bound: false, memberId: "", hasExAccess: false }

/**
 * 本站账号绑定的 e 站凭据，以及每次上游请求用哪个身份、走哪个站。
 *
 * 凭据每次都从库里读（按唯一索引查一行），不在进程里缓存：换绑、解绑当场生效，也就没有「作废缓存时撞上在途回填」这类问题。
 */
@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name)

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly ehClient: EhClient,
  ) {}

  async status(userId: number): Promise<CredentialStatus> {
    return (await this.find(userId))?.status ?? UNBOUND
  }

  /** 绑定前先拿这组 Cookie 实际请求一次，用不了直接回 400，免得把一组坏凭据存进库再让人一脸茫然。 */
  async bind(userId: number, credential: EhCredential): Promise<CredentialStatus> {
    const hasExAccess = await this.ehClient.verifyCredential(credential)
    const row = { ...credential, hasExAccess }
    await this.database
      .insert(ehCredentials)
      .values({ userId, ...row })
      .onConflictDoUpdate({ target: ehCredentials.userId, set: { ...row, updatedAt: sql`now()` } })
    this.logger.log(`已绑定 e 站凭据 userId=${userId} hasExAccess=${hasExAccess}`)
    return { bound: true, memberId: credential.ipbMemberId, hasExAccess }
  }

  /** 解绑后退回匿名浏览表站，回一份解绑后的状态。 */
  async unbind(userId: number): Promise<CredentialStatus> {
    await this.database.delete(ehCredentials).where(eq(ehCredentials.userId, userId))
    return UNBOUND
  }

  /** 一次上游请求的身份与站点：有里站权限就默认走里站（内容是表站的超集），调用方显式要表站时才降级。 */
  async access(userId: number, requested?: Site): Promise<EhAccess> {
    const binding = await this.find(userId)
    if (!binding) {
      return ANONYMOUS
    }
    return accessOf(binding.credential, binding.status.hasExAccess && requested !== "e" ? "ex" : "e")
  }

  private async find(userId: number) {
    const [row] = await this.database
      .select({
        ipbMemberId: ehCredentials.ipbMemberId,
        ipbPassHash: ehCredentials.ipbPassHash,
        igneous: ehCredentials.igneous,
        hasExAccess: ehCredentials.hasExAccess,
      })
      .from(ehCredentials)
      .where(eq(ehCredentials.userId, userId))
    if (!row) {
      return null
    }
    const { hasExAccess, ...credential } = row
    return {
      credential,
      status: { bound: true, memberId: credential.ipbMemberId, hasExAccess } satisfies CredentialStatus,
    }
  }
}
