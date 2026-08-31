import { and, eq } from "drizzle-orm"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import { z } from "zod"
import type { SecretBox } from "../crypto/secretBox"
import { logger } from "../logger"
import type { AttachmentSignature, AttachmentSigner } from "../web/attachmentSigner"
import type { EhClient, EhRequestContext } from "./ehClient"
import { TtlCache } from "./ehCache"
import { EhFailure } from "./ehFailure"
import {
  type EhCookie,
  ehCookieSchema,
  ehCredentialTable,
  ehReadingProgressTable,
  type EhSite,
  type GalleryCard,
  type GalleryComment,
  type GalleryDetail,
  type GalleryRef,
  type GdataEntry,
  gdataResponseSchema,
  showPageResponseSchema,
} from "./ehModels"
import {
  decodeEntities,
  parseGalleryComments,
  parseGalleryList,
  parseGalleryPage,
  parseImagePage,
  parseShowPageFragment,
} from "./ehParser"

/** gdata 单次最多 25 条，这是 e 站定的。 */
const METADATA_BATCH_SIZE = 25

/** 详情页默认每片 20 个缩略图。登录用户可以改成 40/50，所以只作为首次猜测。 */
const DEFAULT_SLICE_SIZE = 20

/** 大图地址模板里的页码占位符，前端替换成实际页码。 */
const PAGE_PLACEHOLDER = "{page}"

/** 分类位掩码。f_cats 传的是「要排除哪些」，不是「要哪些」。 */
const CATEGORY_BITS = {
  misc: 1,
  doujinshi: 2,
  manga: 4,
  artistcg: 8,
  gamecg: 16,
  imageset: 32,
  cosplay: 64,
  asianporn: 128,
  "non-h": 256,
  western: 512,
} as const

/** 十个分类全选中时的位和。 */
const ALL_CATEGORIES = 1023

export type EhCategory = keyof typeof CATEGORY_BITS

/**
 * 分类名的唯一来源，控制器拿它做入参校验。
 * 不校验的话前端把名字拼错只会让那一位掩码算成 0，表现是「筛选点了但结果没变」，无声无息。
 */
export const CATEGORY_NAMES = Object.keys(CATEGORY_BITS) as [EhCategory, ...EhCategory[]]

/**
 * e 站业务编排：把 HTTP 调用、HTML 解析、进程内缓存和用户凭据串起来。
 *
 * 缓存全在进程内，一张缓存表都不建：这些数据都能重新拉，而仓库没有迁移工具，
 * 每加一张表都要人工执行 DDL，为可重建的数据付这个代价不值。
 */
export class EhService {
  private readonly db: BunSQLDatabase
  private readonly ehClient: EhClient
  private readonly secretBox: SecretBox
  private readonly attachmentSigner: AttachmentSigner

  // 键里不带站点：gdata 一律走前站（见 loadGalleries），同一个 gid 的元数据前后站完全一样。
  // 带上站点的话，有里站权限的用户和没有的用户看同一批图集要各打一次 gdata，缓存名额也白占一倍
  private readonly galleryCache = new TtlCache<number, CachedGallery>({ ttlMs: 10 * 60 * 1000, maxEntries: 500 })
  private readonly pageTokenCache = new TtlCache<string, Map<number, string>>({
    ttlMs: 30 * 60 * 1000,
    maxEntries: 200,
  })
  private readonly sliceSizeCache = new TtlCache<string, number>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  private readonly showKeyCache = new TtlCache<string, string>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  private readonly reloadTokenCache = new TtlCache<string, string>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  private readonly imageUrlCache = new TtlCache<string, string>({ ttlMs: 20 * 60 * 1000, maxEntries: 5000 })

  /**
   * 解密过的凭据。图片代理是全系统请求最密集的接口，每张图都查一次库再解一次 AES 太浪费。
   *
   * 存的是 Promise 而不是结果：阅读器一进页面就并发发出四五个请求，存结果的话它们
   * 全都在第一次查询落地之前判定未命中，同一个用户于是被查库、解密四五遍。
   * 绑定解绑时手动失效，TTL 和容量上限只是兜底，免得离开的用户一直占着位置。
   */
  private readonly credentialCache = new TtlCache<number, Promise<BoundCredential | null>>({
    ttlMs: 30 * 60 * 1000,
    maxEntries: 1000,
  })

  /**
   * 在途的详情页请求，按「站点 + 图集 + 分片」去重。
   *
   * 阅读器一打开就并发要当前页和后两页，这三页的令牌通常落在同一片里，
   * 不去重就是同一个 74 KB 的页面抓三遍。出网既不限速也不熔断，这种突发正好
   * 打在最容易招封禁的那条通道上。值刻意是 void——让 Promise 攥着整页 HTML 的话，
   * 这张表就成了另一份没人管过期的缓存。
   */
  private readonly inflightPages = new Map<string, Promise<void>>()

  constructor({
    db,
    ehClient,
    secretBox,
    attachmentSigner,
  }: {
    db: BunSQLDatabase
    ehClient: EhClient
    secretBox: SecretBox
    /** 图片地址的签名器，见 web/attachmentSigner.ts。 */
    attachmentSigner: AttachmentSigner
  }) {
    this.db = db
    this.ehClient = ehClient
    this.secretBox = secretBox
    this.attachmentSigner = attachmentSigner
  }

  /** 绑定状态。不返回明文 Cookie。 */
  async getCredentialStatus(userId: number): Promise<CredentialStatus> {
    const bound = await this.loadCredential(userId)
    return {
      bound: bound !== null,
      memberId: bound?.memberId ?? "",
      hasExAccess: bound?.hasExAccess ?? false,
    }
  }

  /** 保存前先拿这组 Cookie 实际请求一次，无效就别入库，免得事后一脸茫然。 */
  async bindCredential(
    userId: number,
    cookie: EhCookie,
  ): Promise<{ ok: true; status: CredentialStatus } | { ok: false; msg: string }> {
    const { valid, hasExAccess } = await this.ehClient.verifyCredential(cookie)
    if (!valid) {
      return { ok: false, msg: "这组 Cookie 用不了，确认一下是否复制完整、是否已经过期" }
    }

    const cookieEncrypted = await this.secretBox.seal(JSON.stringify(cookie))
    await this.db
      .insert(ehCredentialTable)
      .values({ userId, memberId: cookie.ipbMemberId, cookieEncrypted, hasExAccess })
      .onConflictDoUpdate({
        target: ehCredentialTable.userId,
        set: { memberId: cookie.ipbMemberId, cookieEncrypted, hasExAccess },
      })
    this.credentialCache.delete(userId)

    logger.info({ userId, hasExAccess }, "已绑定 e 站凭据")
    return { ok: true, status: { bound: true, memberId: cookie.ipbMemberId, hasExAccess } }
  }

  async unbindCredential(userId: number): Promise<void> {
    await this.db.delete(ehCredentialTable).where(eq(ehCredentialTable.userId, userId))
    this.credentialCache.delete(userId)
  }

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
    const ctx = await this.requestContext(userId, site)

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
      this.requestContext(userId).then((ctx) => this.loadGalleries(ctx, [ref])),
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
    const ctx = await this.requestContext(userId)
    const html = await this.ehClient.fetchPage(ctx, `/g/${ref.gid}/${ref.token}/?p=0`)
    // 这一页顺带把首片的令牌也收了，等下点「开始阅读」就不用再抓一次
    this.absorbPageTokens(ctx.site, ref.gid, parseGalleryPage(html))
    return parseGalleryComments(html)
  }

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

    const ctx = await this.requestContext(userId)
    const key = imageKey(ctx.site, gid, page)

    let url = this.imageUrlCache.get(key) ?? (await this.resolveImageUrl(ctx, ref, page, { reload: false }))
    let response = await this.ehClient.openImage(url)

    if (!response.ok) {
      logger.info({ gid, page, status: response.status }, "图床节点取图失败，换源重试")
      this.imageUrlCache.delete(key)
      url = await this.resolveImageUrl(ctx, ref, page, { reload: true })
      response = await this.ehClient.openImage(url)
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

  // ---------------------------------------------------------------------------
  // 元数据
  // ---------------------------------------------------------------------------

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
  // 取图
  // ---------------------------------------------------------------------------

  /**
   * 解析出某一页真正的图片地址。
   *
   * 有 showkey 时走 showpage 接口（一次轻量 JSON），没有或已失效就退回抓 /s/ 页面——
   * 那个页面本身就带着图片地址，所以失败路径反而更短。
   */
  private async resolveImageUrl(
    ctx: EhRequestContext,
    ref: GalleryRef,
    page: number,
    { reload }: { reload: boolean },
  ): Promise<string> {
    const key = metaKey(ctx.site, ref.gid)
    const pageToken = await this.ensurePageToken(ctx, ref, page)
    const showKey = reload ? undefined : this.showKeyCache.get(key)

    let url: string | null = null
    if (showKey) {
      url = await this.resolveViaApi(ctx, ref, page, pageToken, showKey)
      if (!url) {
        // showkey 过期了，清掉后回落去抓页面换一个新的
        this.showKeyCache.delete(key)
      }
    }
    url ??= await this.resolveViaPage(ctx, ref, page, pageToken, { reload })

    // 写缓存只在这一个出口，再加解析路径时不用记着「别忘了也写一次缓存」
    this.imageUrlCache.set(imageKey(ctx.site, ref.gid, page), url)
    return url
  }

  /** 走 showpage 接口。showkey 失效时返回 null，交给调用方换路子。 */
  private async resolveViaApi(
    ctx: EhRequestContext,
    ref: GalleryRef,
    page: number,
    pageToken: string,
    showKey: string,
  ): Promise<string | null> {
    const payload = await this.ehClient.callApi(ctx, {
      method: "showpage",
      gid: ref.gid,
      page,
      imgkey: pageToken,
      showkey: showKey,
    })

    const parsed = showPageResponseSchema.safeParse(payload)
    if (!parsed.success || "error" in parsed.data) {
      return null
    }

    const fragment = parseShowPageFragment(parsed.data.i3)
    // 响应里白送了下一页的令牌，顺手存下来，连续翻页就不用再回头请求详情页
    if (fragment.nextPage) {
      this.rememberPageToken(ctx.site, ref.gid, fragment.nextPage.page, fragment.nextPage.token)
    }
    return fragment.imageUrl
  }

  /** 抓 /s/ 页面。顺带把 showkey 和换源令牌记下来。 */
  private async resolveViaPage(
    ctx: EhRequestContext,
    ref: GalleryRef,
    page: number,
    pageToken: string,
    { reload }: { reload: boolean },
  ): Promise<string> {
    const key = metaKey(ctx.site, ref.gid)
    const reloadToken = reload ? this.reloadTokenCache.get(key) : undefined
    // nl 参数让 e 站换一台图床节点，用于原节点失效时重取
    const suffix = reloadToken ? `?nl=${encodeURIComponent(reloadToken)}` : ""

    const html = await this.ehClient.fetchPage(ctx, `/s/${pageToken}/${ref.gid}-${page}${suffix}`)
    const parsed = parseImagePage(html)

    if (parsed.showKey) {
      this.showKeyCache.set(key, parsed.showKey)
    }
    if (parsed.reloadToken) {
      this.reloadTokenCache.set(key, parsed.reloadToken)
    }
    if (!parsed.imageUrl) {
      throw new EhFailure("unavailable", `第 ${page} 页没解析出图片地址，e 站版面可能改了`)
    }

    return parsed.imageUrl
  }

  /**
   * 拿到某一页的图片令牌。
   *
   * 一页详情只列 20 个（登录用户能调到 40/50），所以按需抓包含目标页的那一片。
   * 分片大小先按默认值猜，抓回来后用 Showing 那行给出的真实区间校正，最多再抓一次。
   */
  private async ensurePageToken(ctx: EhRequestContext, ref: GalleryRef, page: number): Promise<string> {
    const key = metaKey(ctx.site, ref.gid)
    const cached = this.pageTokenCache.get(key)?.get(page)
    if (cached) {
      return cached
    }

    let sliceSize = this.sliceSizeCache.get(key) ?? DEFAULT_SLICE_SIZE
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const slice = Math.floor((page - 1) / sliceSize)
      await this.fetchSlice(ctx, ref, slice)

      const found = this.pageTokenCache.get(key)?.get(page)
      if (found) {
        return found
      }
      const corrected = this.sliceSizeCache.get(key)
      if (!corrected || corrected === sliceSize) {
        break
      }
      sliceSize = corrected
    }

    throw new EhFailure("unavailable", `没能取到第 ${page} 页的图片令牌`)
  }

  /**
   * 抓详情页的某一片，把里面的令牌收进缓存。
   * 同一片的并发请求合并成一次上游调用，见 inflightPages 的说明。
   */
  private fetchSlice(ctx: EhRequestContext, ref: GalleryRef, slice: number): Promise<void> {
    const key = `${metaKey(ctx.site, ref.gid)}:${slice}`
    const existing = this.inflightPages.get(key)
    if (existing) {
      return existing
    }

    const task = (async () => {
      // ?p= 是 0 基的，?p=0 就是第一片
      const html = await this.ehClient.fetchPage(ctx, `/g/${ref.gid}/${ref.token}/?p=${slice}`)
      this.absorbPageTokens(ctx.site, ref.gid, parseGalleryPage(html))
    })().finally(() => this.inflightPages.delete(key))

    this.inflightPages.set(key, task)
    return task
  }

  /** 把详情页解析出的令牌与真实分片大小收进缓存。 */
  private absorbPageTokens(site: EhSite, gid: number, parsed: ReturnType<typeof parseGalleryPage>): void {
    for (const { page, token } of parsed.pageTokens) {
      this.rememberPageToken(site, gid, page, token)
    }

    // 只有不是最后一片时区间长度才等于分片大小，最后一片通常是残缺的
    const { range, totalPages } = parsed
    if (range && totalPages !== null && range.to < totalPages) {
      this.sliceSizeCache.set(metaKey(site, gid), range.to - range.from + 1)
    }
  }

  private rememberPageToken(site: EhSite, gid: number, page: number, token: string): void {
    const key = metaKey(site, gid)
    const tokens = this.pageTokenCache.get(key) ?? new Map<number, string>()
    tokens.set(page, token)
    this.pageTokenCache.set(key, tokens)
  }

  // ---------------------------------------------------------------------------
  // 凭据与站点
  // ---------------------------------------------------------------------------

  /**
   * 组一次请求的上下文。
   * 有里站权限就默认走里站（内容是前站的超集），调用方显式要前站时才降级。
   */
  private async requestContext(userId: number, requested?: EhSite): Promise<EhRequestContext> {
    const bound = await this.loadCredential(userId)
    const best: EhSite = bound?.hasExAccess ? "ex" : "e"
    return { credential: bound?.credential ?? null, site: requested === "e" ? "e" : best }
  }

  private loadCredential(userId: number): Promise<BoundCredential | null> {
    const cached = this.credentialCache.get(userId)
    if (cached) {
      return cached
    }

    // 查库失败不能留在缓存里：那样一次数据库抖动会把这个用户钉死到 TTL 到期
    const task = this.readCredential(userId).catch((err: unknown) => {
      this.credentialCache.delete(userId)
      throw err
    })
    this.credentialCache.set(userId, task)
    return task
  }

  private async readCredential(userId: number): Promise<BoundCredential | null> {
    const rows = await this.db.select().from(ehCredentialTable).where(eq(ehCredentialTable.userId, userId)).limit(1)
    const row = rows[0]
    let value: BoundCredential | null = null

    if (row) {
      // 解不开说明主密钥换过或数据被改过，当没绑定处理，让用户重新粘一次比整个接口 500 强
      const parsed = await this.secretBox
        .open(row.cookieEncrypted)
        .then((text) => ehCookieSchema.safeParse(JSON.parse(text) as unknown))
        .catch((err: unknown) => {
          logger.warn({ err, userId }, "解密 e 站凭据失败，按未绑定处理")
          return null
        })
      if (parsed?.success) {
        value = { credential: parsed.data, memberId: row.memberId, hasExAccess: row.hasExAccess }
      }
    }

    return value
  }

  // ---------------------------------------------------------------------------
  // 附件地址
  // ---------------------------------------------------------------------------

  /**
   * 把 e 站的缩略图地址换成本站的代理地址，并签上名。
   * 端点只认自己签发过的地址，客户端因此完全指定不了要去请求哪台主机，SSRF 面积归零。
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
 * thumbnail 换成了上游的原始地址 thumb：本站的代理地址带签名，签名带有效期，
 * 烤进缓存就等于要求「galleryCache 的 TTL 必须短于 ATTACHMENT_TTL_MS」——
 * 那是一条谁都没写下来的约束，把有效期调短一点就会静默失效，表现是缩略图成片裂开。
 * 签名放到组装响应时才做，两个 TTL 从此互不相干。
 */
type CachedGallery = Omit<GalleryDetail, "thumbnail"> & { thumb: string }

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

/** 签名的两个字段拼成查询串。参数名与 ehController 里的 signatureFields 一一对应。 */
function signatureQuery({ expiresAt, signature }: AttachmentSignature): string {
  return `e=${expiresAt}&s=${signature}`
}

/**
 * 把选中的分类换算成 f_cats。
 *
 * f_cats 传的是**要排除**的分类位和，方向很容易写反。
 * 全不选和全选都表示「不过滤」，此时返回 null 让调用方干脆别加这个参数——
 * 按公式算的话全不选会得到 1023，那是「全部排除」，一条结果都搜不出来。
 */
export function toCategoryFilter(categories: EhCategory[]): number | null {
  const selected = categories.reduce((bits, name) => bits | CATEGORY_BITS[name], 0)
  if (selected === 0 || selected === ALL_CATEGORIES) {
    return null
  }
  return ALL_CATEGORIES & ~selected
}

/** 大图通行证签的是「谁能看哪个图集」，页码不在里面。 */
function imageSubject(userId: number, ref: GalleryRef): string {
  return `${userId}:${ref.gid}:${ref.token}`
}

function metaKey(site: EhSite, gid: number): string {
  return `${site}:${gid}`
}

function imageKey(site: EhSite, gid: number, page: number): string {
  return `${site}:${gid}:${page}`
}
