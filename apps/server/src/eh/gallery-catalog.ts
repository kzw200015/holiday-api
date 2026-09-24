import type { GalleryCard, GalleryDetail } from "@myapi/shared"
import { Injectable } from "@nestjs/common"
import { LRUCache } from "lru-cache"

import { AttachmentUrls } from "@/eh/attachment-urls.js"
import { EhClient, METADATA_BATCH_SIZE, type GalleryMetadata } from "@/eh/upstream/eh-client.js"
import { refKey, type GalleryRef } from "@/eh/upstream/gallery-ref.js"

interface Waiting {
  ref: GalleryRef
  resolve: (metadata: GalleryMetadata | undefined) => void
  reject: (error: unknown) => void
}

/**
 * 图集元数据：统一从表站匿名获取，按图集共享缓存。搜索、详情与阅读历史都经这里补全展示信息。
 *
 * 缓存由 lru-cache 的 fetch() 管：同一本同时被要两次只加载一次，加载失败不进缓存。缓存里没有的几本不各打一次接口，
 * 同一轮事件循环里缺的攒成一批，一次向上游要（每批最多 25 本）。缓存里存的是上游原始数据，缩略图在组装卡片时才签名，
 * 签名的有效期因此不受缓存时长影响。
 */
@Injectable()
export class GalleryCatalog {
  private readonly cache = new LRUCache<string, GalleryMetadata, GalleryRef>({
    max: 500,
    ttl: 10 * 60_000,
    fetchMethod: (_key, _stale, { context }) => this.enqueue(context),
  })
  private waiting: Waiting[] = []

  constructor(
    private readonly client: EhClient,
    private readonly urls: AttachmentUrls,
  ) {}

  /** 一批图集的卡片，按 refKey 查；元数据取不到的（被删、转私有）不在结果里，整批请求失败则抛出。搜索结果与阅读历史都用它。 */
  async cards(refs: GalleryRef[]): Promise<Map<string, GalleryCard>> {
    const found = await Promise.all(refs.map((ref) => this.load(ref)))
    return new Map(
      found.filter((metadata) => metadata !== undefined).map((metadata) => [refKey(metadata), this.card(metadata)]),
    )
  }

  /** 一本图集的详情；元数据取不到时是 undefined。 */
  async detail(ref: GalleryRef): Promise<GalleryDetail | undefined> {
    const metadata = await this.load(ref)
    return (
      metadata && {
        ...this.card(metadata),
        fileSize: metadata.fileSize,
        torrentCount: metadata.torrentCount,
        expunged: metadata.expunged,
      }
    )
  }

  private load(ref: GalleryRef): Promise<GalleryMetadata | undefined> {
    return this.cache.fetch(refKey(ref), { context: ref })
  }

  private card(metadata: GalleryMetadata): GalleryCard {
    return {
      gid: metadata.gid,
      token: metadata.token,
      title: metadata.title,
      titleJpn: metadata.titleJpn,
      category: metadata.category,
      thumbnail: this.urls.thumbnail(metadata.thumbnailUrl),
      uploader: metadata.uploader,
      postedAt: metadata.postedAt,
      fileCount: metadata.fileCount,
      rating: metadata.rating,
      tags: metadata.tags,
    }
  }

  private enqueue(ref: GalleryRef): Promise<GalleryMetadata | undefined> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ ref, resolve, reject })
      if (this.waiting.length === 1) {
        setImmediate(() => this.flush())
      }
    })
  }

  private flush() {
    const waiting = this.waiting
    this.waiting = []
    for (let start = 0; start < waiting.length; start += METADATA_BATCH_SIZE) {
      const batch = waiting.slice(start, start + METADATA_BATCH_SIZE)
      this.client.fetchMetadata(batch.map(({ ref }) => ref)).then(
        (found) => batch.forEach(({ ref, resolve }) => resolve(found.get(refKey(ref)))),
        (error: unknown) => batch.forEach(({ reject }) => reject(error)),
      )
    }
  }
}
