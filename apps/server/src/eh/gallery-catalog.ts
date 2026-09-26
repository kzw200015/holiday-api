import type { GalleryCard, GalleryDetail } from "@myapi/shared/eh"
import { LRUCache } from "lru-cache"

import * as attachmentUrls from "@server/eh/attachment-urls"
import * as tagTranslationService from "@server/eh/tag-translation.service"
import type { Translate } from "@server/eh/tag-translation.service"
import * as ehClient from "@server/eh/upstream/eh-client"
import { METADATA_BATCH_SIZE, type GalleryMetadata } from "@server/eh/upstream/eh-client"
import { refKey, type GalleryRef } from "@server/eh/upstream/gallery-ref"

interface Waiting {
  ref: GalleryRef
  resolve: (metadata: GalleryMetadata | undefined) => void
  reject: (error: unknown) => void
}

/*
 * 图集元数据：统一从表站匿名获取，按图集共享缓存。搜索、详情与阅读历史都经这里补全展示信息。
 *
 * 缓存由 lru-cache 的 fetch() 管：同一本同时被要两次只加载一次，加载失败不进缓存。缓存里没有的几本不各打一次接口，
 * 同一轮事件循环里缺的攒成一批，一次向上游要（每批最多 25 本）。缓存里存的是上游原始数据，缩略图在组装卡片时才签名，
 * 标签也在这时才套上译名：签名的有效期不受缓存时长影响，同步过的译名也当场生效。
 */

const cache = new LRUCache<string, GalleryMetadata, GalleryRef>({
  max: 500,
  ttl: 10 * 60_000,
  fetchMethod: (_key, _stale, { context }) => enqueue(context),
})

/** 这一轮事件循环里等着向上游要的 */
let waiting: Waiting[] = []

/** 一批图集的卡片，按 refKey 查；元数据取不到的（被删、转私有）不在结果里，整批请求失败则抛出。搜索结果与阅读历史都用它。 */
export async function cards(refs: GalleryRef[]): Promise<Map<string, GalleryCard>> {
  const found = (await Promise.all(refs.map((ref) => load(ref)))).filter((metadata) => metadata !== undefined)
  /* 整批的标签一起查译名，一页只查一次库 */
  const translate = await tagTranslationService.translator(found.flatMap((metadata) => metadata.tags))
  return new Map(found.map((metadata) => [refKey(metadata), card(metadata, translate)]))
}

/** 一本图集的详情；元数据取不到时是 undefined。 */
export async function detail(ref: GalleryRef): Promise<GalleryDetail | undefined> {
  const metadata = await load(ref)
  if (!metadata) {
    return undefined
  }
  const translate = await tagTranslationService.translator(metadata.tags)
  return {
    ...card(metadata, translate),
    fileSize: metadata.fileSize,
    torrentCount: metadata.torrentCount,
    expunged: metadata.expunged,
  }
}

function load(ref: GalleryRef): Promise<GalleryMetadata | undefined> {
  return cache.fetch(refKey(ref), { context: ref })
}

function card(metadata: GalleryMetadata, translate: Translate): GalleryCard {
  return {
    gid: metadata.gid,
    token: metadata.token,
    title: metadata.title,
    titleJpn: metadata.titleJpn,
    category: metadata.category,
    thumbnail: attachmentUrls.thumbnail(metadata.thumbnailUrl),
    uploader: metadata.uploader,
    postedAt: metadata.postedAt,
    fileCount: metadata.fileCount,
    rating: metadata.rating,
    tags: translate(metadata.tags),
  }
}

function enqueue(ref: GalleryRef): Promise<GalleryMetadata | undefined> {
  return new Promise((resolve, reject) => {
    waiting.push({ ref, resolve, reject })
    if (waiting.length === 1) {
      setImmediate(flush)
    }
  })
}

function flush() {
  const pending = waiting
  waiting = []
  for (let start = 0; start < pending.length; start += METADATA_BATCH_SIZE) {
    const batch = pending.slice(start, start + METADATA_BATCH_SIZE)
    ehClient.fetchMetadata(batch.map(({ ref }) => ref)).then(
      (found) => batch.forEach(({ ref, resolve }) => resolve(found.get(refKey(ref)))),
      (error: unknown) => batch.forEach(({ reject }) => reject(error)),
    )
  }
}
