import { TtlCache } from "./ehCache"
import type { EhClient, EhRequestContext } from "./ehClient"
import { EhFailure } from "./ehFailure"
import { type EhSite, type GalleryRef, showPageResponseSchema } from "./ehModels"
import { parseGalleryPage, parseImagePage, parseShowPageFragment } from "./ehParser"

/** 详情页默认每片 20 个缩略图。登录用户可以改成 40/50，所以只作为首次猜测。 */
const DEFAULT_SLICE_SIZE = 20

/**
 * 「第 N 页的图片地址是什么」这条链路，连同它一整套进程内缓存。
 *
 * 从 EhService 里分出来是因为这里的状态最密集：每页令牌、分片大小、showkey、换源令牌、
 * 解析出的地址各有一张缓存表，还有一张在途请求表，它们只服务于取图，跟搜索、详情、进度无关。
 *
 * 请求路径是这样省下来的：详情页首片给出前 20 页的令牌 → 抓一次 /s/ 页拿 showkey →
 * 之后每页只打一次 showpage 接口，而它的响应里白送了下一页的令牌。所以顺序读一本 300 页的图集，
 * HTML 请求总共只有 2 次，只有跳页才会回头抓详情页的其它分片。
 */
export class EhImageLocator {
  private readonly ehClient: Pick<EhClient, "fetchPage" | "callApi">

  private readonly pageTokenCache = new TtlCache<string, Map<number, string>>({
    ttlMs: 30 * 60 * 1000,
    maxEntries: 200,
  })
  private readonly sliceSizeCache = new TtlCache<string, number>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  private readonly showKeyCache = new TtlCache<string, string>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  private readonly reloadTokenCache = new TtlCache<string, string>({ ttlMs: 30 * 60 * 1000, maxEntries: 200 })
  private readonly imageUrlCache = new TtlCache<string, string>({ ttlMs: 20 * 60 * 1000, maxEntries: 5000 })

  /**
   * 在途的详情页请求，按「站点 + 图集 + 分片」去重。
   *
   * 阅读器一打开就并发要当前页和后两页，这三页的令牌通常落在同一片里，
   * 不去重就是同一个 74 KB 的页面抓三遍。出网既不限速也不熔断，这种突发正好
   * 打在最容易招封禁的那条通道上。值刻意是 void——让 Promise 攥着整页 HTML 的话，
   * 这张表就成了另一份没人管过期的缓存。
   */
  private readonly inflightPages = new Map<string, Promise<void>>()

  constructor(ehClient: Pick<EhClient, "fetchPage" | "callApi">) {
    this.ehClient = ehClient
  }

  /**
   * 解析出某一页真正的图片地址。
   *
   * 有 showkey 时走 showpage 接口（一次轻量 JSON），没有或已失效就退回抓 /s/ 页面——
   * 那个页面本身就带着图片地址，所以失败路径反而更短。
   *
   * reload 用于图床节点失效（表现为图片 403）后换一台机器重取：它绕开所有缓存，
   * 并带上页面里的 nl 令牌让 e 站换源。
   */
  async resolve(
    ctx: EhRequestContext,
    ref: GalleryRef,
    page: number,
    { reload = false }: { reload?: boolean } = {},
  ): Promise<string> {
    const urlKey = imageKey(ctx.site, ref.gid, page)
    if (reload) {
      // 旧地址已经证明取不到了，先清掉：万一这次解析也失败，下次进来不该又拿到它
      this.imageUrlCache.delete(urlKey)
    } else {
      const cached = this.imageUrlCache.get(urlKey)
      if (cached) {
        return cached
      }
    }

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
    this.imageUrlCache.set(urlKey, url)
    return url
  }

  /**
   * 收下一页详情 HTML 里顺带带来的每页令牌。
   * 评论接口抓的就是详情首片，读完令牌等下点「开始阅读」就不用再抓一次。
   */
  absorbGalleryPage(site: EhSite, gid: number, html: string): void {
    const parsed = parseGalleryPage(html)
    for (const { page, token } of parsed.pageTokens) {
      this.rememberPageToken(site, gid, page, token)
    }

    // 只有不是最后一片时区间长度才等于分片大小，最后一片通常是残缺的
    const { range, totalPages } = parsed
    if (range && totalPages !== null && range.to < totalPages) {
      this.sliceSizeCache.set(metaKey(site, gid), range.to - range.from + 1)
    }
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
      this.absorbGalleryPage(ctx.site, ref.gid, html)
    })().finally(() => this.inflightPages.delete(key))

    this.inflightPages.set(key, task)
    return task
  }

  private rememberPageToken(site: EhSite, gid: number, page: number, token: string): void {
    const key = metaKey(site, gid)
    const tokens = this.pageTokenCache.get(key) ?? new Map<number, string>()
    tokens.set(page, token)
    this.pageTokenCache.set(key, tokens)
  }
}

/** 按站点区分的图集级缓存键：每页令牌、分片大小、showkey、换源令牌共用它。 */
function metaKey(site: EhSite, gid: number): string {
  return `${site}:${gid}`
}

function imageKey(site: EhSite, gid: number, page: number): string {
  return `${site}:${gid}:${page}`
}
