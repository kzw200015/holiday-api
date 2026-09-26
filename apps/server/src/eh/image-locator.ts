import { LRUCache } from "lru-cache"

import type { EhAccess } from "@server/eh/upstream/access"
import type { EhClient } from "@server/eh/upstream/eh-client"
import { unavailable } from "@server/eh/upstream/failures"
import { refKey, type GalleryRef } from "@server/eh/upstream/gallery-ref"
import type { GallerySlice, ImagePage } from "@server/eh/upstream/parse"
import { notFound } from "@server/http-error"

interface SliceRequest {
  access: EhAccess
  ref: GalleryRef
  index: number
}

/** 分片大小受账号设置影响（20/40/50），没记过就按 20 猜。 */
const DEFAULT_SLICE_SIZE = 20

/**
 * 取图链路：从图集定位到某一页真正的图片地址。
 *
 * 一页图要先从详情页分片里拿到这页的页令牌，再经 showpage 接口（有 showkey 时）或抓图片页拿到图床地址。
 * 途中拿到的东西都记下来，顺序翻页时就不必回头再抓：分片顺带给出一整片的页令牌，图片页顺带给出下一页的令牌和 showkey。
 * 这些一律按上游身份（EhAccess.scope）与图集隔离，换绑凭据就进入新的作用域，不同身份之间不共享页面。
 */
export class ImageLocator {
  /** 评论与第一页图常常同时要同一片：同一片同一时刻只抓一次，抓到后留一会儿给紧跟着的请求用。 */
  private readonly slices = new LRUCache<string, GallerySlice, SliceRequest>({
    max: 50,
    ttl: 60_000,
    fetchMethod: (_key, _stale, { context }) => this.fetchSlice(context),
  })
  private readonly pageTokens = new LRUCache<string, string>({ max: 20_000, ttl: 30 * 60_000 })
  /** 分片大小是账号设置，按身份记：换一本图集照样猜得对。 */
  private readonly sliceSizes = new LRUCache<string, number>({ max: 200, ttl: 30 * 60_000 })
  private readonly showKeys = new LRUCache<string, string>({ max: 200, ttl: 30 * 60_000 })

  private readonly ehClient: EhClient

  constructor(ehClient: EhClient) {
    this.ehClient = ehClient
  }

  /** 详情页的某一片。评论也从第 0 片里取。fetchSlice 要么给出分片要么抛出，forceFetch 在没拿到值时也会抛出。 */
  gallerySlice(access: EhAccess, ref: GalleryRef, index: number): Promise<GallerySlice> {
    return this.slices.forceFetch(`${galleryKey(access, ref)}#${index}`, { context: { access, ref, index } })
  }

  /** 这一页的图片地址。有 showkey 先走 showpage 接口；只有 showkey 明确失效才回退到抓图片页，其余协议错误照常抛出。 */
  async locate(access: EhAccess, ref: GalleryRef, page: number): Promise<ImagePage> {
    const gallery = galleryKey(access, ref)
    const pageToken = await this.pageToken(access, ref, page)
    const showKey = this.showKeys.get(gallery)
    let image = showKey ? await this.ehClient.showImage(access, ref, page, pageToken, showKey) : null
    if (showKey && !image) {
      this.showKeys.delete(gallery)
    }
    image ??= await this.ehClient.fetchImagePage(access, ref, page, pageToken)
    return this.remember(gallery, image)
  }

  /**
   * 图床节点失效后换一台：带着这一页自己的换源令牌（nl）重抓图片页，不能借用别的页的。
   * showpage 接口可能没给 nl，那就先抓一次这一页拿到它，再换源。
   */
  async relocate(access: EhAccess, ref: GalleryRef, page: number, failed: ImagePage): Promise<ImagePage> {
    const pageToken = await this.pageToken(access, ref, page)
    let image = await this.ehClient.fetchImagePage(access, ref, page, pageToken, failed.reloadToken)
    if (!failed.reloadToken && image.reloadToken) {
      image = await this.ehClient.fetchImagePage(access, ref, page, pageToken, image.reloadToken)
    }
    return this.remember(galleryKey(access, ref), image)
  }

  private async fetchSlice({ access, ref, index }: SliceRequest): Promise<GallerySlice> {
    const slice = await this.ehClient.fetchGallerySlice(access, ref, index)
    const gallery = galleryKey(access, ref)
    for (const [page, token] of slice.pageTokens) {
      this.pageTokens.set(`${gallery}@${page}`, token)
    }
    if (slice.sliceSize !== null) {
      this.sliceSizes.set(access.scope, slice.sliceSize)
    }
    return slice
  }

  /**
   * 这一页的页令牌。先按记下的（或默认的）分片大小猜它在哪一片；猜的那片若是满的，它自己就给出了真实的分片大小；
   * 若是最后一片（不满，或者猜的序号超出范围、e 站退回了最后一片），就从第一片推：第一片要么是满的，要么整本只有这一片。
   * 每次都从这次拿到的分片里直接找，不依赖缓存还在。
   */
  private async pageToken(access: EhAccess, ref: GalleryRef, page: number): Promise<string> {
    const known = this.pageTokens.get(`${galleryKey(access, ref)}@${page}`)
    if (known) {
      return known
    }
    const guessed = this.sliceSizes.get(access.scope) ?? DEFAULT_SLICE_SIZE
    const slice = await this.gallerySlice(access, ref, Math.floor((page - 1) / guessed))
    const token = slice.pageTokens.get(page)
    if (token) {
      return token
    }
    if (slice.pageCount !== null && page > slice.pageCount) {
      throw notFound(`第 ${page} 页超出了图集的页数（共 ${slice.pageCount} 页）`)
    }
    let size = slice.sliceSize
    if (size === null) {
      const first = await this.gallerySlice(access, ref, 0)
      const inFirst = first.pageTokens.get(page)
      if (inFirst) {
        return inFirst
      }
      size = first.sliceSize
    }
    if (size !== null && size !== guessed) {
      const actual = (await this.gallerySlice(access, ref, Math.floor((page - 1) / size))).pageTokens.get(page)
      if (actual) {
        return actual
      }
    }
    throw unavailable(`没能取到第 ${page} 页的图片令牌`, `gid=${ref.gid} sliceSize=${size ?? "未知"}`)
  }

  private remember(gallery: string, image: ImagePage): ImagePage {
    if (image.showKey) {
      this.showKeys.set(gallery, image.showKey)
    }
    /* 下一页的令牌白送，顺序阅读就不用再回头请求详情页了 */
    if (image.next) {
      this.pageTokens.set(`${gallery}@${image.next.page}`, image.next.token)
    }
    return image
  }
}

function galleryKey(access: EhAccess, ref: GalleryRef) {
  return `${access.scope}|${refKey(ref)}`
}
