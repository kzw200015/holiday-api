import type { CredentialStatus, ehCookieSchema } from "@myapi/shared/eh"
import { eq, sql } from "drizzle-orm"
import type { z } from "zod"

import { database } from "@server/database/connection"
import { ehCredentials } from "@server/eh/eh.tables"
import { accessOf, ANONYMOUS, type EhAccess } from "@server/eh/upstream/access"
import * as ehClient from "@server/eh/upstream/eh-client"
import { Logger } from "@server/logger"

/*
 * 本站账号绑定的 e 站凭据，以及每次上游请求用哪个身份、走哪个站。
 *
 * 凭据每次都从库里读（按唯一索引查一行），不在进程里缓存：换绑、解绑当场生效，也就没有「作废缓存时撞上在途回填」这类问题。
 */

const logger = new Logger("CredentialService")

const UNBOUND: CredentialStatus = { bound: false, memberId: "", hasExAccess: false }

export async function status(userId: number): Promise<CredentialStatus> {
  return (await find(userId))?.status ?? UNBOUND
}

/** 绑定前先拿这组 Cookie 实际请求一次，用不了直接回 400，免得把一组坏凭据存进库再让人一脸茫然。 */
export async function bind(userId: number, credential: z.output<typeof ehCookieSchema>): Promise<CredentialStatus> {
  const hasExAccess = await ehClient.verifyCredential(credential)
  const row = { ...credential, hasExAccess }
  await database
    .insert(ehCredentials)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: ehCredentials.userId, set: { ...row, updatedAt: sql`now()` } })
  logger.log(`已绑定 e 站凭据 userId=${userId} hasExAccess=${hasExAccess}`)
  return { bound: true, memberId: credential.ipbMemberId, hasExAccess }
}

/** 解绑后退回匿名浏览表站，回一份解绑后的状态。 */
export async function unbind(userId: number): Promise<CredentialStatus> {
  await database.delete(ehCredentials).where(eq(ehCredentials.userId, userId))
  return UNBOUND
}

/** 一次上游请求的身份与站点：有里站权限就走里站，它的内容是表站的超集。 */
export async function access(userId: number): Promise<EhAccess> {
  const binding = await find(userId)
  if (!binding) {
    return ANONYMOUS
  }
  return accessOf(binding.credential, binding.status.hasExAccess ? "ex" : "e")
}

async function find(userId: number) {
  const [row] = await database
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
