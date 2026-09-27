import { LRUCache } from "lru-cache"

import * as attachmentUrls from "@server/eh/attachment-urls"
import * as tagTranslationService from "@server/eh/tag-translation-service"
import * as ehClient from "@server/eh/upstream/eh-client"
import { refKey, type GalleryRef } from "@server/eh/upstream/gallery-ref"

/*
 * 图集元数据：统一从表站匿名获取，按图集共享缓存。搜索、详情与阅读历史都经这里补全展示信息。
 *
 * 取一本图集的元数据要经过三层，依次写在本文件后半：
 * 1. 缓存：有就直接用。同一本正在加载时，后到的等同一份结果，不再加载第二次；加载失败不进缓存。
 * 2. 排队：缓存里没有的不各打一次上游，先排进队列，同一轮事件循环里缺的都攒到一起。
 * 3. 上游：下一轮把队列按上游的单次上限（25 本）切批，各批同时发出，结果分回给排队的那些。
 *
 * 缓存里存的是上游原始数据，缩略图在组装卡片时才签名，标签也在这时才套上译名：签名的有效期不受缓存时长影响，
 * 同步过的译名也当场生效。
 */

/** 列表里一张卡片的内容：元数据里给人看的那些，缩略图签成本站的代理地址、标签套上译名 */
export interface GalleryCard extends Omit<
  ehClient.GalleryMetadata,
  "thumbnailUrl" | "tags" | "fileSize" | "torrentCount" | "expunged"
> {
  /** 已经是本站的代理地址，可直接放进 img 的 src */
  thumbnail: string
  tags: tagTranslationService.GalleryTag[]
}

/** 详情接口的返回：比卡片多出几个字段，与卡片的字段平铺在一起。阅读进度另有接口，见 reading-service.ts 的 ReadingProgress */
export type GalleryDetail = GalleryCard & Pick<ehClient.GalleryMetadata, "fileSize" | "torrentCount" | "expunged">

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

function card(metadata: ehClient.GalleryMetadata, translate: tagTranslationService.Translate): GalleryCard {
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

/* ---- 第 1 层：缓存 ---- */

/*
 * lru-cache 的 fetch()：缓存里有就直接给；没有就调 fetchMethod 加载，加载期间同一个 key 再来 fetch() 拿到的是同一个 Promise。
 * 缓存的 key 只是 refKey 字符串，加载要用的完整 GalleryRef 经 context 带过去。
 */
const cache = new LRUCache<string, ehClient.GalleryMetadata, GalleryRef>({
  max: 500,
  ttl: 10 * 60_000,
  fetchMethod: (_key, _stale, { context: ref }) => requestFromUpstream(ref),
})

/** 一本图集的元数据；上游没有这一本（被删、转私有）时是 undefined */
function load(ref: GalleryRef): Promise<ehClient.GalleryMetadata | undefined> {
  return cache.fetch(refKey(ref), { context: ref })
}

/* ---- 第 2 层：排队 ---- */

/** 排着队等上游结果的一本：结果回来时调 resolve，整批失败时调 reject */
interface Queued {
  ref: GalleryRef
  resolve: (metadata: ehClient.GalleryMetadata | undefined) => void
  reject: (error: unknown) => void
}

/** 这一轮事件循环里缓存没有、等着向上游要的；整个进程共用一个，不同请求缺的也攒到一起 */
let queue: Queued[] = []

/** 排进队列，返回的 Promise 要等这一本所在的那批从上游回来才有结果 */
function requestFromUpstream(ref: GalleryRef): Promise<ehClient.GalleryMetadata | undefined> {
  return new Promise((resolve, reject) => {
    queue.push({ ref, resolve, reject })
    /*
     * 这一轮进队的第一本负责约好发送时间。setImmediate 要等本轮的同步代码和所有 await 链都跑完才执行，
     * 到那时这一轮缺的都已进队，一次发出。
     */
    if (queue.length === 1) {
      setImmediate(sendQueue)
    }
  })
}

/* ---- 第 3 层：上游 ---- */

/** 取空队列，按上游的单次上限切批；各批同时发出、各自成败，不等前一批 */
function sendQueue() {
  const queued = queue
  queue = []
  for (let start = 0; start < queued.length; start += ehClient.METADATA_BATCH_SIZE) {
    void sendBatch(queued.slice(start, start + ehClient.METADATA_BATCH_SIZE))
  }
}

/** 一批一次请求，结果按 refKey 分回给批里每一本；上游没给的那本拿到 undefined，整批失败则每本都拿到这个错误 */
async function sendBatch(batch: Queued[]) {
  try {
    const found = await ehClient.fetchMetadata(batch.map(({ ref }) => ref))
    for (const { ref, resolve } of batch) {
      resolve(found.get(refKey(ref)))
    }
  } catch (error) {
    for (const { reject } of batch) {
      reject(error)
    }
  }
}
