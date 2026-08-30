import { and, eq } from "drizzle-orm"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import { z } from "zod"
import type { SecretBox } from "../crypto/secretBox"
import { logger } from "../logger"
import type { EhClient, EhRequestContext } from "./ehClient"
import { createTtlCache } from "./ehCache"
import { ehFailure } from "./ehFailure"
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

export type EhService = ReturnType<typeof createEhService>

/**
 * e 站业务编排：把限速过的 HTTP 调用、HTML 解析、进程内缓存和用户凭据串起来。
 *
 * 缓存全在进程内，一张缓存表都不建：这些数据都能重新拉，而仓库没有迁移工具，
 * 每加一张表都要人工执行 DDL，为可重建的数据付这个代价不值。
 */
export function createEhService({
  db,
  ehClient,
  secretBox,
  thumbnailKey,
}: {
  db: BunSQLDatabase
  ehClient: EhClient
  secretBox: SecretBox
  /** 缩略图代理地址的签名密钥，由主密钥按用途派生而来。 */
  thumbnailKey: string
}) {
  // 键里不带站点：gdata 一律走前站（见 loadGalleries），同一个 gid 的元数据前后站完全一样。
  // 带上站点的话，有里站权限的用户和没有的用户看同一批图集要各打一次 gdata，缓存名额也白占一倍
  const galleryCache = createTtlCache<number, GalleryDetail>({ ttlMs: 10 * 60 * 1000, maxEntries: 500 })
  const pageTokenCache = createTtlCache<string, Map<number, string>>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  const sliceSizeCache = createTtlCache<string, number>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  const showKeyCache = createTtlCache<string, string>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  const reloadTokenCache = createTtlCache<string, string>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  const imageUrlCache = createTtlCache<string, string>({ ttlMs: 20 * 60 * 1000, maxEntries: 5000 })

  /**
   * 解密过的凭据。图片代理是全系统请求最密集的接口，
   * 每张图都查一次库再解一次 AES 太浪费，所以常驻内存，绑定和解绑时手动失效。
   */
  const credentialCache = new Map<number, BoundCredential | null>()

  return {
    /** 绑定状态。不返回明文 Cookie。 */
    async getCredentialStatus(userId: number): Promise<CredentialStatus> {
      const bound = await loadCredential(userId)
      return {
        bound: bound !== null,
        memberId: bound?.memberId ?? "",
        hasExAccess: bound?.hasExAccess ?? false,
      }
    },

    /** 保存前先拿这组 Cookie 实际请求一次，无效就别入库，免得事后一脸茫然。 */
    async bindCredential(userId: number, cookie: EhCookie): Promise<{ ok: true; status: CredentialStatus } | { ok: false; msg: string }> {
      const { valid, hasExAccess } = await ehClient.verifyCredential(userId, cookie)
      if (!valid) {
        return { ok: false, msg: "这组 Cookie 用不了，确认一下是否复制完整、是否已经过期" }
      }

      const cookieEncrypted = await secretBox.seal(JSON.stringify(cookie))
      await db
        .insert(ehCredentialTable)
        .values({ userId, memberId: cookie.ipbMemberId, cookieEncrypted, hasExAccess })
        .onConflictDoUpdate({
          target: ehCredentialTable.userId,
          set: { memberId: cookie.ipbMemberId, cookieEncrypted, hasExAccess },
        })
      credentialCache.delete(userId)

      logger.info({ userId, hasExAccess }, "已绑定 e 站凭据")
      return { ok: true, status: { bound: true, memberId: cookie.ipbMemberId, hasExAccess } }
    },

    async unbindCredential(userId: number): Promise<void> {
      await db.delete(ehCredentialTable).where(eq(ehCredentialTable.userId, userId))
      credentialCache.delete(userId)
    },

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
      const ctx = await requestContext(userId, site)

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

      const html = await ehClient.fetchPage(ctx, `/?${query.toString()}`)
      const { items, nextCursor } = parseGalleryList(html)
      const galleries = await loadGalleries(ctx, items)

      return { items: galleries.map(toCard), nextCursor }
    },

    /** 图集详情。只打一次 gdata，评论另有接口懒加载。 */
    async getGalleryDetail(
      userId: number,
      ref: GalleryRef,
    ): Promise<{ gallery: GalleryDetail; progress: number | null }> {
      const ctx = await requestContext(userId)
      // 进度只用到 userId 和 gid，跟元数据没有依赖关系，别让它排在那次上游调用后面
      const [galleries, rows] = await Promise.all([
        loadGalleries(ctx, [ref]),
        db
          .select({ page: ehReadingProgressTable.page })
          .from(ehReadingProgressTable)
          .where(and(eq(ehReadingProgressTable.userId, userId), eq(ehReadingProgressTable.gid, ref.gid)))
          .limit(1),
      ])

      const [gallery] = galleries
      if (!gallery) {
        throw ehFailure("unavailable", "这个图集取不到，可能已被删除或转为私有")
      }

      return { gallery, progress: rows[0]?.page ?? null }
    },

    /** 评论。这是详情页 HTML 里唯一拿不到 JSON 替代的东西，所以单独一次请求。 */
    async getGalleryComments(userId: number, ref: GalleryRef): Promise<GalleryComment[]> {
      const ctx = await requestContext(userId)
      const html = await ehClient.fetchPage(ctx, `/g/${ref.gid}/${ref.token}/?p=0`)
      // 这一页顺带把首片的令牌也收了，等下点「开始阅读」就不用再抓一次
      absorbPageTokens(ctx.site, ref.gid, parseGalleryPage(html))
      return parseGalleryComments(html)
    },

    /**
     * 取某一页的大图，返回可直接转发的流。
     * 图床节点会失效（表现为 403），所以拿不到时用换源令牌重试一次。
     */
    async openGalleryImage(userId: number, ref: GalleryRef, page: number): Promise<ImageStream> {
      const ctx = await requestContext(userId)
      const key = imageKey(ctx.site, ref.gid, page)

      let url = imageUrlCache.get(key) ?? (await resolveImageUrl(ctx, ref, page, { reload: false }))
      let response = await ehClient.openImage(userId, url)

      if (!response.ok) {
        logger.info({ gid: ref.gid, page, status: response.status }, "图床节点取图失败，换源重试")
        imageUrlCache.delete(key)
        url = await resolveImageUrl(ctx, ref, page, { reload: true })
        response = await ehClient.openImage(userId, url)
      }

      return toImageStream(response, `第 ${page} 页`)
    },

    /** 缩略图代理。只接受本服务签发过的地址，客户端指定不了主机。 */
    async openThumbnail(userId: number, encodedUrl: string, signature: string): Promise<ImageStream> {
      const url = verifyThumbnailUrl(encodedUrl, signature)
      if (!url) {
        throw ehFailure("unavailable", "缩略图地址签名不正确")
      }
      const response = await ehClient.openImage(userId, url)
      if (!response.ok) {
        throw ehFailure("unavailable", `缩略图取不到（HTTP ${response.status}）`)
      }
      return toImageStream(response, "缩略图")
    },

    /**
     * 记下读到第几页。同一个图集只留一条，重复上报就覆盖。
     * created_at / updated_at 由模型里的 timestamps 自动带上，连 upsert 的 set 也会带，这里不用管。
     */
    async saveProgress(userId: number, ref: GalleryRef, page: number): Promise<void> {
      await db
        .insert(ehReadingProgressTable)
        .values({ userId, gid: ref.gid, token: ref.token, page })
        .onConflictDoUpdate({
          target: [ehReadingProgressTable.userId, ehReadingProgressTable.gid],
          set: { token: ref.token, page },
        })
    },
  }

  // ---------------------------------------------------------------------------
  // 元数据
  // ---------------------------------------------------------------------------

  /** 批量补全元数据，命中缓存的跳过，剩下的按 25 一批打 gdata。 */
  async function loadGalleries(ctx: EhRequestContext, refs: GalleryRef[]): Promise<GalleryDetail[]> {
    const missing = refs.filter((ref) => !galleryCache.get(ref.gid))

    for (let index = 0; index < missing.length; index += METADATA_BATCH_SIZE) {
      const chunk = missing.slice(index, index + METADATA_BATCH_SIZE)
      // gdata 走前站就够：免登录、返回的封面也落在 ehgt.org 上，不用把用户身份带过去
      const payload = await ehClient.callApi({ ...ctx, site: "e" }, {
        method: "gdata",
        gidlist: chunk.map((ref) => [ref.gid, ref.token]),
        namespace: 1,
      })

      const parsed = gdataResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw ehFailure("unavailable", `e 站元数据格式异常: ${z.prettifyError(parsed.error)}`)
      }
      for (const entry of parsed.data.gmetadata) {
        // 被删或转私有的图集单条会变成 { error }，跳过它，别让一条坏数据废掉整批
        if ("error" in entry) {
          continue
        }
        galleryCache.set(entry.gid, toDetail(entry))
      }
    }

    return refs.map((ref) => galleryCache.get(ref.gid)).filter((item) => item !== undefined)
  }

  function toDetail(entry: GdataEntry): GalleryDetail {
    return {
      gid: entry.gid,
      token: entry.token,
      // gdata 返回的标题是 HTML 转义过的，实测有 `Arcueid &amp; Ciel x Goblin`
      title: decodeEntities(entry.title),
      titleJpn: decodeEntities(entry.title_jpn),
      category: entry.category,
      thumbnail: signThumbnailUrl(entry.thumb),
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

  // ---------------------------------------------------------------------------
  // 取图
  // ---------------------------------------------------------------------------

  /**
   * 解析出某一页真正的图片地址。
   *
   * 有 showkey 时走 showpage 接口（一次轻量 JSON），没有或已失效就退回抓 /s/ 页面——
   * 那个页面本身就带着图片地址，所以失败路径反而更短。
   */
  async function resolveImageUrl(
    ctx: EhRequestContext,
    ref: GalleryRef,
    page: number,
    { reload }: { reload: boolean },
  ): Promise<string> {
    const pageToken = await ensurePageToken(ctx, ref, page)
    const showKey = reload ? undefined : showKeyCache.get(metaKey(ctx.site, ref.gid))

    const url = await (async () => {
      if (showKey) {
        const viaApi = await resolveViaApi(ctx, ref, page, pageToken, showKey)
        if (viaApi) {
          return viaApi
        }
        // showkey 过期了，清掉后按下面的流程重抓一次页面换新的
        showKeyCache.delete(metaKey(ctx.site, ref.gid))
      }
      return resolveViaPage(ctx, ref, page, pageToken, { reload })
    })()

    // 写缓存只在这一个出口，再加解析路径时不用记着「别忘了也写一次缓存」
    imageUrlCache.set(imageKey(ctx.site, ref.gid, page), url)
    return url
  }

  /** 走 showpage 接口。showkey 失效时返回 null，交给调用方换路子。 */
  async function resolveViaApi(
    ctx: EhRequestContext,
    ref: GalleryRef,
    page: number,
    pageToken: string,
    showKey: string,
  ): Promise<string | null> {
    const payload = await ehClient.callApi(ctx, {
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
      rememberPageToken(ctx.site, ref.gid, fragment.nextPage.page, fragment.nextPage.token)
    }
    return fragment.imageUrl
  }

  /** 抓 /s/ 页面。顺带把 showkey 和换源令牌记下来。 */
  async function resolveViaPage(
    ctx: EhRequestContext,
    ref: GalleryRef,
    page: number,
    pageToken: string,
    { reload }: { reload: boolean },
  ): Promise<string> {
    const key = metaKey(ctx.site, ref.gid)
    const reloadToken = reload ? reloadTokenCache.get(key) : undefined
    // nl 参数让 e 站换一台图床节点，用于原节点失效时重取
    const suffix = reloadToken ? `?nl=${encodeURIComponent(reloadToken)}` : ""

    const html = await ehClient.fetchPage(ctx, `/s/${pageToken}/${ref.gid}-${page}${suffix}`)
    const parsed = parseImagePage(html)

    if (parsed.showKey) {
      showKeyCache.set(key, parsed.showKey)
    }
    if (parsed.reloadToken) {
      reloadTokenCache.set(key, parsed.reloadToken)
    }
    if (!parsed.imageUrl) {
      throw ehFailure("unavailable", `第 ${page} 页没解析出图片地址，e 站版面可能改了`)
    }

    return parsed.imageUrl
  }

  /**
   * 拿到某一页的图片令牌。
   *
   * 一页详情只列 20 个（登录用户能调到 40/50），所以按需抓包含目标页的那一片。
   * 分片大小先按默认值猜，抓回来后用 Showing 那行给出的真实区间校正，最多再抓一次。
   */
  async function ensurePageToken(ctx: EhRequestContext, ref: GalleryRef, page: number): Promise<string> {
    const key = metaKey(ctx.site, ref.gid)
    const cached = pageTokenCache.get(key)?.get(page)
    if (cached) {
      return cached
    }

    let sliceSize = sliceSizeCache.get(key) ?? DEFAULT_SLICE_SIZE
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const slice = Math.floor((page - 1) / sliceSize)
      // ?p= 是 0 基的，?p=0 就是第一片
      const html = await ehClient.fetchPage(ctx, `/g/${ref.gid}/${ref.token}/?p=${slice}`)
      const parsed = parseGalleryPage(html)
      absorbPageTokens(ctx.site, ref.gid, parsed)

      const found = pageTokenCache.get(key)?.get(page)
      if (found) {
        return found
      }
      const corrected = sliceSizeCache.get(key)
      if (!corrected || corrected === sliceSize) {
        break
      }
      sliceSize = corrected
    }

    throw ehFailure("unavailable", `没能取到第 ${page} 页的图片令牌`)
  }

  /** 把详情页解析出的令牌与真实分片大小收进缓存。 */
  function absorbPageTokens(
    site: EhSite,
    gid: number,
    parsed: ReturnType<typeof parseGalleryPage>,
  ): void {
    for (const { page, token } of parsed.pageTokens) {
      rememberPageToken(site, gid, page, token)
    }

    // 只有不是最后一片时区间长度才等于分片大小，最后一片通常是残缺的
    const { range, totalPages } = parsed
    if (range && totalPages !== null && range.to < totalPages) {
      sliceSizeCache.set(metaKey(site, gid), range.to - range.from + 1)
    }
  }

  function rememberPageToken(site: EhSite, gid: number, page: number, token: string): void {
    const key = metaKey(site, gid)
    const tokens = pageTokenCache.get(key) ?? new Map<number, string>()
    tokens.set(page, token)
    pageTokenCache.set(key, tokens)
  }

  // ---------------------------------------------------------------------------
  // 凭据与站点
  // ---------------------------------------------------------------------------

  /**
   * 组一次请求的上下文。
   * 有里站权限就默认走里站（内容是前站的超集），调用方显式要前站时才降级。
   */
  async function requestContext(userId: number, requested?: EhSite): Promise<EhRequestContext> {
    const bound = await loadCredential(userId)
    const best: EhSite = bound?.hasExAccess ? "ex" : "e"
    return { userId, credential: bound?.credential ?? null, site: requested === "e" ? "e" : best }
  }

  async function loadCredential(userId: number): Promise<BoundCredential | null> {
    const cached = credentialCache.get(userId)
    if (cached !== undefined) {
      return cached
    }

    const rows = await db.select().from(ehCredentialTable).where(eq(ehCredentialTable.userId, userId)).limit(1)
    const row = rows[0]
    let value: BoundCredential | null = null

    if (row) {
      // 解不开说明主密钥换过或数据被改过，当没绑定处理，让用户重新粘一次比整个接口 500 强
      const parsed = await secretBox
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

    credentialCache.set(userId, value)
    return value
  }

  // ---------------------------------------------------------------------------
  // 缩略图签名
  // ---------------------------------------------------------------------------

  /**
   * 把 e 站的缩略图地址换成本站的代理地址，并签上名。
   * 端点只认自己签发过的地址，客户端因此完全指定不了要去请求哪台主机，SSRF 面积归零。
   */
  function signThumbnailUrl(url: string): string {
    const encoded = Buffer.from(url).toString("base64url")
    return `/api/eh/thumbnail?u=${encoded}&s=${thumbnailSignature(url)}`
  }

  function verifyThumbnailUrl(encoded: string, signature: string): string | null {
    // base64url 解码对非法输入不抛错，只会得到一串乱码，挡住它的是下面的签名比对
    const url = Buffer.from(encoded, "base64url").toString()
    const expected = thumbnailSignature(url)
    // 长度一致再比，timingSafeEqual 对长度不同的输入会直接抛错
    if (signature.length !== expected.length) {
      return null
    }
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? url : null
  }

  function thumbnailSignature(url: string): string {
    return new Bun.CryptoHasher("sha256", thumbnailKey).update(url).digest("hex").slice(0, 32)
  }
}

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
    throw ehFailure("unavailable", `${what}返回的不是图片（${contentType || "无类型"}）`)
  }
  return { body: response.body, contentType, contentLength: response.headers.get("content-length") }
}

/** 列表里只用得上这些字段，写成独立函数是为了控制 JSON 的字段顺序。 */
function toCard(detail: GalleryDetail): GalleryCard {
  return {
    gid: detail.gid,
    token: detail.token,
    title: detail.title,
    titleJpn: detail.titleJpn,
    category: detail.category,
    thumbnail: detail.thumbnail,
    uploader: detail.uploader,
    postedAt: detail.postedAt,
    fileCount: detail.fileCount,
    rating: detail.rating,
    tags: detail.tags,
  }
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

function metaKey(site: EhSite, gid: number): string {
  return `${site}:${gid}`
}

function imageKey(site: EhSite, gid: number, page: number): string {
  return `${site}:${gid}:${page}`
}
