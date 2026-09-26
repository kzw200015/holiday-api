import type { GalleryTag, TagTranslationStatus } from "@myapi/shared/eh"
import { desc, sql } from "drizzle-orm"
import { LRUCache } from "lru-cache"

import { database } from "@server/database/connection"
import { ehTagTranslations, ehTagTranslationSyncs } from "@server/eh/eh.tables"
import * as tagTranslationSource from "@server/eh/tag-translation.source"
import type { TagRef } from "@server/eh/upstream/eh-client"
import { Logger } from "@server/logger"

/* 命名空间本身的译名，上游归在这个命名空间下，raw 是命名空间名 */
const NAMESPACE_NAMES = "rows"

/* 一条 INSERT 的行数：PostgreSQL 一条语句最多 65535 个参数，每行三个 */
const INSERT_BATCH_SIZE = 5000

interface TranslationKey {
  namespace: string
  raw: string
}

/* 命名空间里没有冒号，拼起来不会撞 */
const keyOf = ({ namespace, raw }: TranslationKey) => `${namespace}:${raw}`

/* 一个标签要查的两条：命名空间的译名与标签的译名 */
const keysOf = ({ namespace, value }: TagRef): [TranslationKey, TranslationKey] => [
  { namespace: NAMESPACE_NAMES, raw: namespace },
  { namespace, raw: value },
]

/** 备齐译名之后的换算：标签原文 → 带译名的标签，同步完成。 */
export type Translate = (tags: TagRef[]) => GalleryTag[]

/* 键是「命名空间:原文」，值是要显示的名字：有译名是译名，没有是原文——查过没有的也记住，免得长尾标签每次都查库 */
const createCache = () => new LRUCache<string, string>({ max: 50_000 })

/*
 * 标签译名：从 EhTagTranslation 手动同步进库，读的时候按条查、进程内缓存（见 ADR-0005）。
 *
 * 一次响应里的标签一起备齐：缓存里没有的攒到一起，一条 SQL 查回来——一页搜索结果几百个标签，也只查一次库。
 * 同步之后整个换一份新缓存；查询途中撞上同步的，结果写进它开始时的那份旧缓存，随它一起丢掉，不会把旧译名留到新缓存里。
 */

const logger = new Logger("TagTranslationService")

let cache = createCache()

/** 进行中的那次同步 */
let syncing: Promise<TagTranslationStatus> | undefined

/** 备齐这些标签的译名，回一个同步的换算：没有译名的用原文。 */
export async function translator(tags: TagRef[]): Promise<Translate> {
  const current = cache
  const names = new Map<string, string>()
  const missing = new Map<string, TranslationKey>()
  for (const key of tags.flatMap(keysOf)) {
    const id = keyOf(key)
    const cached = current.get(id)
    if (cached === undefined) {
      missing.set(id, key)
    } else {
      names.set(id, cached)
    }
  }
  if (missing.size > 0) {
    const found = await query([...missing.values()])
    for (const [id, { raw }] of missing) {
      const name = found.get(id) ?? raw
      names.set(id, name)
      current.set(id, name)
    }
  }
  const nameOf = (key: TranslationKey) => names.get(keyOf(key)) ?? key.raw
  return (refs) =>
    refs.map((ref) => {
      const [namespaceKey, valueKey] = keysOf(ref)
      return { ...ref, namespaceName: nameOf(namespaceKey), name: nameOf(valueKey) }
    })
}

export async function status(): Promise<TagTranslationStatus> {
  const [last] = await database
    .select({
      sha: ehTagTranslationSyncs.sha,
      count: ehTagTranslationSyncs.count,
      syncedAt: ehTagTranslationSyncs.createdAt,
    })
    .from(ehTagTranslationSyncs)
    .orderBy(desc(ehTagTranslationSyncs.id))
    .limit(1)
  return { lastSync: last ? { ...last, syncedAt: last.syncedAt.toISOString() } : null }
}

/** 从上游拉一版替换掉库里的。同一时刻的几次同步合成一次，后来的等着前一次的结果，不重复拉取。 */
export function sync(): Promise<TagTranslationStatus> {
  syncing ??= replace().finally(() => {
    syncing = undefined
  })
  return syncing
}

async function replace(): Promise<TagTranslationStatus> {
  /* 拉取放在事务外，免得一次慢请求白占着数据库连接 */
  const { sha, entries } = await tagTranslationSource.fetchRelease()
  const { lastSync } = await status()
  /* 上游没变就不重写四万多行，只记下这次同步 */
  if (lastSync?.sha === sha) {
    await database.insert(ehTagTranslationSyncs).values({ sha, count: entries.length })
    logger.log(`标签译名没有变化 sha=${sha}`)
    return status()
  }
  /* 删和插在一个事务里：中途出错即回滚，不会留下「旧的没了、新的只进来一半」的表 */
  await database.transaction(async (tx) => {
    await tx.delete(ehTagTranslations)
    for (let start = 0; start < entries.length; start += INSERT_BATCH_SIZE) {
      /* oxlint-disable-next-line no-await-in-loop -- 一个事务只占一条连接，语句本来就只能一条接一条执行。 */
      await tx.insert(ehTagTranslations).values(entries.slice(start, start + INSERT_BATCH_SIZE))
    }
    await tx.insert(ehTagTranslationSyncs).values({ sha, count: entries.length })
  })
  cache = createCache()
  logger.log(`已同步标签译名 sha=${sha} count=${entries.length}`)
  return status()
}

async function query(keys: TranslationKey[]): Promise<Map<string, string>> {
  const pairs = sql.join(
    keys.map(({ namespace, raw }) => sql`(${namespace}, ${raw})`),
    sql`, `,
  )
  const rows = await database
    .select({ namespace: ehTagTranslations.namespace, raw: ehTagTranslations.raw, name: ehTagTranslations.name })
    .from(ehTagTranslations)
    .where(sql`(${ehTagTranslations.namespace}, ${ehTagTranslations.raw}) IN (${pairs})`)
  return new Map(rows.map((row) => [keyOf(row), row.name]))
}
