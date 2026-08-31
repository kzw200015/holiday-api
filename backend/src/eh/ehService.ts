import { and, eq } from "drizzle-orm"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import { z } from "zod"
import type { AttachmentSignature, AttachmentSigner } from "../crypto/attachmentSigner"
import { logger } from "../logger"
import { TtlCache } from "./ehCache"
import { type EhCategory, toCategoryFilter } from "./ehCategory"
import type { EhClient, EhRequestContext } from "./ehClient"
import type { EhCredentialStore } from "./ehCredentials"
import { EhFailure } from "./ehFailure"
import type { EhImageLocator } from "./ehImageLocator"
import {
  type EhCookie,
  ehReadingProgressTable,
  type EhSite,
  type GalleryCard,
  type GalleryComment,
  type GalleryDetail,
  type GalleryRef,
  type GdataEntry,
  gdataResponseSchema,
} from "./ehModels"
import { decodeEntities, parseGalleryComments, parseGalleryList } from "./ehParser"

/** gdata 单次最多 25 条，这是 e 站定的。 */
const METADATA_BATCH_SIZE = 25

/** 大图地址模板里的页码占位符，前端替换成实际页码。 */
const PAGE_PLACEHOLDER = "{page}"

/**
 * e 站模块对外的门面：控制器只认这一个类，模块内部的分工不外泄。
 *
 * 它自己负责编排——把上游调用、HTML 解析、元数据缓存和附件签名串成一次次用例；
 * 另外两块状态各自成类：用户凭据见 EhCredentialStore，每页令牌与图片地址见 EhImageLocator。
 *
 * 缓存全在进程内，一张缓存表都不建：这些数据都能重新拉，而每加一张表都要走一次迁移，
 * 为可重建的数据付这个代价不值。
 */
export class EhService {
  private readonly db: BunSQLDatabase
  private readonly ehClient: Pick<EhClient, "fetchPage" | "callApi" | "openImage">
  private readonly credentials: EhCredentialStore
  private readonly imageLocator: EhImageLocator
  private readonly attachmentSigner: AttachmentSigner

  // 键里不带站点：gdata 一律走前站（见 loadGalleries），同一个 gid 的元数据前后站完全一样。
  // 带上站点的话，有里站权限的用户和没有的用户看同一批图集要各打一次 gdata，缓存名额也白占一倍
  private readonly galleryCache = new TtlCache<number, CachedGallery>({ ttlMs: 10 * 60 * 1000, maxEntries: 500 })

  constructor({
    db,
    ehClient,
    credentials,
    imageLocator,
    attachmentSigner,
  }: {
    db: BunSQLDatabase
    ehClient: Pick<EhClient, "fetchPage" | "callApi" | "openImage">
    credentials: EhCredentialStore
    imageLocator: EhImageLocator
    /** 图片地址的签名器，见 crypto/attachmentSigner.ts。 */
    attachmentSigner: AttachmentSigner
  }) {
    this.db = db
    this.ehClient = ehClient
    this.credentials = credentials
    this.imageLocator = imageLocator
    this.attachmentSigner = attachmentSigner
  }

  // ---------------------------------------------------------------------------
  // 凭据。三个方法原样转交给 EhCredentialStore：让「eh 模块对外提供哪些用例」在一个类上看全，
  // 控制器也就不必同时注入两个依赖
  // ---------------------------------------------------------------------------

  /** 绑定状态。不返回明文 Cookie。 */
  getCredentialStatus(userId: number) {
    return this.credentials.status(userId)
  }

  /** 绑定前会拿这组 Cookie 实际请求一次，无效不入库。 */
  bindCredential(userId: number, cookie: EhCookie) {
    return this.credentials.bind(userId, cookie)
  }

  unbindCredential(userId: number): Promise<void> {
    return this.credentials.unbind(userId)
  }

  // ---------------------------------------------------------------------------
  // 浏览
  // ---------------------------------------------------------------------------

  /**
   * 搜索图集。
   *
   * 列表页 HTML 只用来取图集序列和游标，标题标签这些一律走 gdata：
   * 那边是结构化 JSON，比盯着会改版的 HTML 稳得多。
   */
  async searchGalleries(
    userId: number,
    { keyword, categories, cursor, site }: { keyword: string; categories: EhCategory[]; cursor: string; site?: EhSite },
  ): Promise<{ items: GalleryCard[]; nextCursor: string | null }> {
    const ctx = await this.credentials.requestContext(userId, site)

    const query = new URLSearchParams()
    if (keyword) {
      // URLSearchParams 自己会做 UTF-8 百分号编码，中文关键词直接放就行
      query.set("f_search", keyword)
    }
    const excluded = toCategoryFilter(categories)
    if (excluded !== null) {
      query.set("f_cats", String(excluded))
    }
    if (cursor) {
      // 游标不携带筛选条件，翻页时 f_search 和 f_cats 必须一起重发
      query.set("next", cursor)
    }

    const html = await this.ehClient.fetchPage(ctx, `/?${query.toString()}`)
    const { items, nextCursor } = parseGalleryList(html)
    const galleries = await this.loadGalleries(ctx, items)

    return { items: galleries.map((gallery) => toCard(gallery, this.thumbnailUrl(gallery.thumb))), nextCursor }
  }

  /**
   * 图集详情。只打一次 gdata，评论另有接口懒加载。
   * 顺带签发这本图集的大图地址模板，阅读时前端只替换页码，不必每页再问一次。
   */
  async getGalleryDetail(
    userId: number,
    ref: GalleryRef,
  ): Promise<{ gallery: GalleryDetail; progress: number | null; imageUrlTemplate: string }> {
    // 进度只用到 userId 和 gid，跟元数据没有依赖关系，
    // 别让它排在那次上游调用后面——连取凭据的那次查库也一起绕开
    const [galleries, rows] = await Promise.all([
      this.credentials.requestContext(userId).then((ctx) => this.loadGalleries(ctx, [ref])),
      this.db
        .select({ page: ehReadingProgressTable.page })
        .from(ehReadingProgressTable)
        .where(and(eq(ehReadingProgressTable.userId, userId), eq(ehReadingProgressTable.gid, ref.gid)))
        .limit(1),
    ])

    const [gallery] = galleries
    if (!gallery) {
      throw new EhFailure("unavailable", "这个图集取不到，可能已被删除或转为私有")
    }

    return {
      gallery: toDetail(gallery, this.thumbnailUrl(gallery.thumb)),
      progress: rows[0]?.page ?? null,
      imageUrlTemplate: this.imageUrlTemplate(userId, ref),
    }
  }

  /** 评论。这是详情页 HTML 里唯一拿不到 JSON 替代的东西，所以单独一次请求。 */
  async getGalleryComments(userId: number, ref: GalleryRef): Promise<GalleryComment[]> {
    const ctx = await this.credentials.requestContext(userId)
    const html = await this.ehClient.fetchPage(ctx, `/g/${ref.gid}/${ref.token}/?p=0`)
    // 这一页顺带把首片的令牌也收了，等下点「开始阅读」就不用再抓一次
    this.imageLocator.absorbGalleryPage(ctx.site, ref.gid, html)
    return parseGalleryComments(html)
  }

  /**
   * 记下读到第几页。同一个图集只留一条，重复上报就覆盖。
   * created_at / updated_at 由模型里的 timestamps 自动带上，连 upsert 的 set 也会带，这里不用管。
   */
  async saveProgress(userId: number, ref: GalleryRef, page: number): Promise<void> {
    await this.db
      .insert(ehReadingProgressTable)
      .values({ userId, gid: ref.gid, token: ref.token, page })
      .onConflictDoUpdate({
        target: [ehReadingProgressTable.userId, ehReadingProgressTable.gid],
        set: { token: ref.token, page },
      })
  }

  /** 批量补全元数据，命中缓存的跳过，剩下的按 25 一批打 gdata。 */
  private async loadGalleries(ctx: EhRequestContext, refs: GalleryRef[]): Promise<CachedGallery[]> {
    const missing = refs.filter((ref) => !this.galleryCache.get(ref.gid))

    for (let index = 0; index < missing.length; index += METADATA_BATCH_SIZE) {
      const chunk = missing.slice(index, index + METADATA_BATCH_SIZE)
      // gdata 走前站就够：免登录、返回的封面也落在 ehgt.org 上，不用把用户身份带过去
      const payload = await this.ehClient.callApi(
        { ...ctx, site: "e" },
        {
          method: "gdata",
          gidlist: chunk.map((ref) => [ref.gid, ref.token]),
          namespace: 1,
        },
      )

      const parsed = gdataResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new EhFailure("unavailable", `e 站元数据格式异常: ${z.prettifyError(parsed.error)}`)
      }
      for (const entry of parsed.data.gmetadata) {
        // 被删或转私有的图集单条会变成 { error }，跳过它，别让一条坏数据废掉整批
        if ("error" in entry) {
          continue
        }
        this.galleryCache.set(entry.gid, toCached(entry))
      }
    }

    return refs.map((ref) => this.galleryCache.get(ref.gid)).filter((item) => item !== undefined)
  }

  // ---------------------------------------------------------------------------
  // 图片。签名既在这里签发也在这里校验，两处共用同一个 subject 拼法，
  // 分开写的话哪天不一致，表现是所有图片一起打不开，而各自的单测都是绿的
  // ---------------------------------------------------------------------------

  /**
   * 取某一页的大图，返回可直接转发的流。
   *
   * 地址由 getGalleryDetail 签发，签名覆盖「谁看哪个图集」但不覆盖页码——一本图集一张通行证，
   * 否则 300 页的图集要回传 300 条签好的地址。userId 只能从签名过的参数里来，
   * 不能信客户端随便给的值，否则等于拿别人的 e 站凭据取图。
   * 图床节点会失效（表现为 403），所以拿不到时用换源令牌重试一次。
   */
  async openGalleryImage({
    userId,
    gid,
    token,
    page,
    signature,
  }: GalleryRef & {
    userId: number
    page: number
    signature: AttachmentSignature
  }): Promise<ImageStream> {
    const ref: GalleryRef = { gid, token }
    if (!this.attachmentSigner.verify(imageSubject(userId, ref), signature)) {
      throw new EhFailure("badSignature", "图片地址签名不正确或已过期，回到详情页重进一次")
    }

    const ctx = await this.credentials.requestContext(userId)
    let response = await this.ehClient.openImage(await this.imageLocator.resolve(ctx, ref, page))

    if (!response.ok) {
      logger.info({ gid, page, status: response.status }, "图床节点取图失败，换源重试")
      response = await this.ehClient.openImage(await this.imageLocator.resolve(ctx, ref, page, { reload: true }))
    }

    return toImageStream(response, `第 ${page} 页`)
  }

  /**
   * 缩略图代理。只接受本服务签发过的地址，客户端指定不了主机。
   * 不需要 userId：缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关。
   */
  async openThumbnail(encodedUrl: string, signature: AttachmentSignature): Promise<ImageStream> {
    // base64url 解码对非法输入不抛错，只会得到一串乱码，挡住它的是随后的签名比对
    const url = Buffer.from(encodedUrl, "base64url").toString()
    if (!this.attachmentSigner.verify(url, signature)) {
      throw new EhFailure("badSignature", "缩略图地址签名不正确或已过期")
    }

    const response = await this.ehClient.openImage(url)
    if (!response.ok) {
      throw new EhFailure("unavailable", `缩略图取不到（HTTP ${response.status}）`)
    }
    return toImageStream(response, "缩略图")
  }

  /**
   * 把 e 站的缩略图地址换成本站的代理地址，并签上名。
   * 端点只认自己签发过的地址，客户端因此完全指定不了要去请求哪台主机，SSRF 面积归零。
   *
   * 签名在组装响应时才做，不进 galleryCache：签名带有效期，烤进缓存等于要求
   * 「galleryCache 的 TTL 必须短于 ATTACHMENT_TTL_MS」，那是一条没人写下来的约束。
   */
  private thumbnailUrl(url: string): string {
    const encoded = Buffer.from(url).toString("base64url")
    return `/api/eh/thumbnail?u=${encoded}&${signatureQuery(this.attachmentSigner.sign(url))}`
  }

  /**
   * 大图地址的模板，`{page}` 由前端替换成实际页码。
   *
   * 签名覆盖「谁看哪个图集」，页码不参与——一本图集签一张通行证，
   * 不然 300 页的图集详情就得回传 300 条签好的地址。
   */
  private imageUrlTemplate(userId: number, ref: GalleryRef): string {
    const query = signatureQuery(this.attachmentSigner.sign(imageSubject(userId, ref)))
    return `/api/eh/galleries/${ref.gid}/${ref.token}/pages/${PAGE_PLACEHOLDER}/image?uid=${userId}&${query}`
  }
}

/**
 * 缓存里的图集元数据。
 *
 * 存的是上游的原始地址 thumb 而不是 GalleryDetail 的 thumbnail：后者是本站签过名的代理地址，
 * 带有效期，不该被烤进一份 TTL 与它无关的缓存里（见 thumbnailUrl）。
 */
type CachedGallery = Omit<GalleryDetail, "thumbnail"> & { thumb: string }

/** 可直接转发给浏览器的图片流。控制器负责组装成 Response。 */
export interface ImageStream {
  body: ReadableStream<Uint8Array>
  contentType: string
  contentLength: string | null
}

function toImageStream(response: Response, what: string): ImageStream {
  const contentType = response.headers.get("content-type") ?? ""
  // 上游出错时回的是 HTML 错误页，原样转发会让浏览器显示一张裂图，日志里也查不出原因
  if (!response.body || !contentType.startsWith("image/")) {
    // 这份 body 没人会读了，不关掉的话连接要等 GC 才归还
    void response.body?.cancel().catch(() => {})
    throw new EhFailure("unavailable", `${what}返回的不是图片（${contentType || "无类型"}）`)
  }
  return { body: response.body, contentType, contentLength: response.headers.get("content-length") }
}

/** gdata 的一条记录 → 缓存里的元数据。 */
function toCached(entry: GdataEntry): CachedGallery {
  return {
    gid: entry.gid,
    token: entry.token,
    // gdata 返回的标题是 HTML 转义过的，实测有 `Arcueid &amp; Ciel x Goblin`
    title: decodeEntities(entry.title),
    titleJpn: decodeEntities(entry.title_jpn),
    category: entry.category,
    thumb: entry.thumb,
    uploader: entry.uploader,
    postedAt: new Date(entry.posted * 1000).toISOString(),
    fileCount: entry.filecount,
    rating: entry.rating,
    tags: entry.tags.map(decodeEntities),
    fileSize: entry.filesize,
    torrentCount: entry.torrentcount,
    expunged: entry.expunged,
  }
}

/** 列表里只用得上这些字段，写成独立函数是为了控制 JSON 的字段顺序。 */
function toCard(gallery: CachedGallery, thumbnail: string): GalleryCard {
  return {
    gid: gallery.gid,
    token: gallery.token,
    title: gallery.title,
    titleJpn: gallery.titleJpn,
    category: gallery.category,
    thumbnail,
    uploader: gallery.uploader,
    postedAt: gallery.postedAt,
    fileCount: gallery.fileCount,
    rating: gallery.rating,
    tags: gallery.tags,
  }
}

/** 详情比列表多三个字段。同样显式列出来，字段顺序就是 JSON 的序列化顺序。 */
function toDetail(gallery: CachedGallery, thumbnail: string): GalleryDetail {
  return {
    ...toCard(gallery, thumbnail),
    fileSize: gallery.fileSize,
    torrentCount: gallery.torrentCount,
    expunged: gallery.expunged,
  }
}

/** 签名的两个字段拼成查询串。参数名与 ehImageController 里的 signatureFields 一一对应。 */
function signatureQuery({ expiresAt, signature }: AttachmentSignature): string {
  return `e=${expiresAt}&s=${signature}`
}

/** 大图通行证签的是「谁能看哪个图集」，页码不在里面。 */
function imageSubject(userId: number, ref: GalleryRef): string {
  return `${userId}:${ref.gid}:${ref.token}`
}
