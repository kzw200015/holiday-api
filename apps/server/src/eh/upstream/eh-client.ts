import type { EhCredential, GalleryDetail, GallerySearch } from "@myapi/shared"
import { Inject, Injectable, Logger } from "@nestjs/common"

import { ANONYMOUS, cookieHeader, SITES, type EhAccess } from "@/eh/upstream/access.js"
import { categoryFilter } from "@/eh/upstream/categories.js"
import {
  banned,
  contentWarning,
  credentialRejected,
  imageNodeFailure,
  quotaExceeded,
  sadPanda,
  unavailable,
  unreachable,
  upstreamNotice,
} from "@/eh/upstream/failures.js"
import { refKey, type GalleryRef } from "@/eh/upstream/gallery-ref.js"
import { isAllowedImageUrl } from "@/eh/upstream/image-hosts.js"
import {
  decodeEntities,
  parseGalleryList,
  parseGallerySlice,
  parseImagePage,
  parseNotice,
  type GalleryList,
  type GallerySlice,
  type ImagePage,
} from "@/eh/upstream/parse.js"
import { OUTBOUND, type Outbound } from "@/outbound/outbound.module.js"

/** 标准化后的上游元数据：详情的字段，只是缩略图还是上游原地址、没签成本站的代理地址。 */
export type GalleryMetadata = Omit<GalleryDetail, "thumbnail"> & { thumbnailUrl: string }

/** 已校验过的图片流，外加转发时要带的响应头。 */
export interface ImageStream {
  contentType: string
  /** 上游给的长度；分块传输或内容被解压过时没有 */
  contentLength: number | null
  body: ReadableStream<Uint8Array>
  /** 上游地址，只用于日志 */
  source: string
}

/** 元数据接口一次最多查这么多本。由调用方按它切批，各批各自成败，一批失败不连累别的批。 */
export const METADATA_BATCH_SIZE = 25

/** 配额用尽时 e 站不报错，而是把大图换成一张提示图：表站 ehgt.org/g/509.gif，里站 exhentai.org/img/509.gif，小图叫 509s.gif。 */
const QUOTA_IMAGE = /^https:\/\/(?:ehgt\.org\/g|exhentai\.org\/img)\/509s?\.gif$/

/** 未登录时 home.php 会 302 到论坛登录页，登录成功才是 200：拿它检验一组 Cookie 在表站认不认。 */
const HOME_URL = `${SITES.e.page}/home.php`

/** 读进内存的上游响应。 */
interface UpstreamResponse {
  url: string
  status: number
  body: string
}

/**
 * e 站的只读客户端：上游协议、「200 但不是内容」的识别与失败翻译，以及已校验过的图片流。
 * 出网只有 Outbound 这一个出口。
 */
@Injectable()
export class EhClient {
  private readonly logger = new Logger(EhClient.name)

  constructor(@Inject(OUTBOUND) private readonly outbound: Outbound) {}

  async search(access: EhAccess, { keyword, categories, cursor }: GallerySearch): Promise<GalleryList> {
    /* 表单编码（空格编成 +），与 e 站自己的搜索表单一致 */
    const query = new URLSearchParams()
    if (keyword) {
      query.set("f_search", keyword)
    }
    const filter = categoryFilter(categories)
    if (filter !== null) {
      query.set("f_cats", String(filter))
    }
    if (cursor) {
      query.set("next", cursor)
    }
    const response = await this.getPage(access, `/?${query}`)
    return parseGalleryList(response.body) ?? this.unrecognized(response, "没有识别出图集搜索结果，e 站版面可能改了")
  }

  /** 元数据一律匿名请求表站，一次最多 METADATA_BATCH_SIZE 本；整批失败报错，单本不可访问的不出现在结果里。 */
  async fetchMetadata(refs: GalleryRef[]): Promise<Map<string, GalleryMetadata>> {
    const response = await this.api(ANONYMOUS, {
      method: "gdata",
      gidlist: refs.map((ref) => [ref.gid, ref.token]),
      namespace: 1,
    })
    /* 整个请求被拒时（gidlist 格式不对、条数超限）没有 gmetadata，只有一个顶层的 error */
    if (typeof response.error === "string" && response.error) {
      throw unavailable("e 站元数据接口拒绝了请求", `error=${response.error}`)
    }
    if (!Array.isArray(response.gmetadata)) {
      throw unavailable("e 站元数据接口没有返回图集数据")
    }
    const requested = new Set(refs.map(refKey))
    const batch = new Map<string, GalleryMetadata>()
    for (const entry of response.gmetadata) {
      if (!isRecord(entry)) {
        throw unavailable("e 站元数据接口返回的图集数据格式不对", `entry=${JSON.stringify(entry)}`)
      }
      /* 单个图集被删或转私有时，那一条会变成 { gid, error }，跳过它，别让整批作废 */
      if (entry.error) {
        continue
      }
      const metadata = toMetadata(entry)
      if (!requested.has(refKey(metadata))) {
        throw unavailable("e 站返回的图集定位信息与请求不一致")
      }
      batch.set(refKey(metadata), metadata)
    }
    return batch
  }

  async fetchGallerySlice(access: EhAccess, ref: GalleryRef, slice: number): Promise<GallerySlice> {
    const response = await this.getPage(access, `/g/${ref.gid}/${ref.token}/?p=${slice}`)
    const parsed = parseGallerySlice(response.body, ref.gid)
    if (parsed.pageTokens.size === 0) {
      this.unrecognized(response, "图集页面没有可识别的图片令牌")
    }
    return parsed
  }

  /** 抓一页图片页。带上换源令牌时，e 站会换一台图床节点给出图片地址。 */
  async fetchImagePage(
    access: EhAccess,
    ref: GalleryRef,
    page: number,
    pageToken: string,
    reloadToken: string | null = null,
  ): Promise<ImagePage> {
    const reload = reloadToken ? `?${new URLSearchParams({ nl: reloadToken })}` : ""
    const response = await this.getPage(access, `/s/${pageToken}/${ref.gid}-${page}${reload}`)
    const image =
      parseImagePage(response.body) ?? this.unrecognized(response, `第 ${page} 页没解析出图片地址，e 站版面可能改了`)
    return withinQuota(image)
  }

  /**
   * 经 showpage 接口取图片地址，比抓整张图片页省。showkey 过期时返回 null，调用方回退到抓图片页；其余协议错误照常抛出。
   * 必须带着抓图片页时的同一份身份：showkey 是那个会话拿到的，兑换却按匿名算就对不上。
   */
  async showImage(
    access: EhAccess,
    ref: GalleryRef,
    page: number,
    pageToken: string,
    showKey: string,
  ): Promise<ImagePage | null> {
    const response = await this.api(access, {
      method: "showpage",
      gid: ref.gid,
      page,
      imgkey: pageToken,
      showkey: showKey,
    })
    if (response.error === "Key mismatch") {
      return null
    }
    if (response.error) {
      throw unavailable("e 站图片接口拒绝了请求", `error=${String(response.error)}`)
    }
    const image = typeof response.i3 === "string" ? parseImagePage(response.i3) : null
    if (!image) {
      throw unavailable(`第 ${page} 页的图片接口没有返回图片地址`)
    }
    return withinQuota(image)
  }

  /**
   * 验证一组 Cookie 能不能用，能用就顺便回答有没有里站权限。
   *
   * 「Cookie 不对」和「e 站没连上」是两种错：前者回 400 让用户重新复制，后者是 502 或 429，
   * 混成一句「这组 Cookie 用不了」会让人对着一组好好的 Cookie 反复重贴。两个请求互不依赖，一起发出。
   */
  async verifyCredential(credential: EhCredential): Promise<boolean> {
    const cookie = cookieHeader(credential)
    const [home, ex] = await Promise.allSettled([this.read(HOME_URL, cookie), this.read(`${SITES.ex.page}/`, cookie)])
    if (home.status === "rejected") {
      throw home.reason
    }
    if (home.value.status !== 200) {
      throw credentialRejected()
    }
    /* 200 也可能是封禁页：那时 Cookie 本身没问题，报成「Cookie 用不了」会误导 */
    this.assertUsable(home.value)
    /* 里站在账号没权限时回 200 加空 body（俗称 sad panda）；那一探连不上就当没有权限，表站已经证明凭据是好的 */
    return ex.status === "fulfilled" && ex.value.status === 200 && ex.value.body.trim() !== ""
  }

  /**
   * 取一张图片，交出已校验的图片流；失败时由这里释放响应。
   * 地址必须在图片主机白名单里：这是唯一接受任意上游地址的入口。图床不认 e 站的身份，所以一个 Cookie 都不带。
   */
  async openImage(url: string): Promise<ImageStream> {
    if (!isAllowedImageUrl(url)) {
      throw unavailable("图片地址不在允许的范围内", `url=${url}`)
    }
    this.logger.debug(`请求 e 站 GET ${url}`)
    let response: Response
    try {
      response = await this.outbound(url)
    } catch (error) {
      throw imageNodeFailure(url, error)
    }
    try {
      if (response.status === 509) {
        throw quotaExceeded()
      }
      if (response.status !== 200 || !response.body) {
        throw imageNodeFailure(url, `HTTP ${response.status}`)
      }
      /*
       * 上游出错时回的是 HTML 错误页，原样转发会让浏览器显示一张裂图。SVG 也不放行：它能带脚本，
       * 图片地址在本站源下被直接打开时就能读到登录令牌，而图床节点是第三方志愿者运营的。
       */
      const contentType = response.headers.get("content-type") ?? ""
      const type = contentType.toLowerCase()
      if (!type.startsWith("image/") || type.startsWith("image/svg")) {
        throw unavailable("图床返回的不是图片", `content-type=${contentType || "无"} url=${url}`)
      }
      /* 被压缩传输的内容 fetch 会自动解压，上游给的长度就对不上了 */
      const length = response.headers.get("content-encoding") ? null : response.headers.get("content-length")
      return { contentType, contentLength: length ? Number(length) : null, body: response.body, source: url }
    } catch (error) {
      await response.body?.cancel().catch(() => undefined)
      throw error
    }
  }

  private async getPage(access: EhAccess, pathAndQuery: string): Promise<UpstreamResponse> {
    const response = await this.read(`${SITES[access.site].page}${pathAndQuery}`, cookieHeader(access.credential))
    this.assertUsable(response)
    return response
  }

  /**
   * 调 JSON 接口（gdata / showpage）。解得开的 JSON 不按文案判断：标题是任意文本，里面出现「temporarily banned」
   * 不代表被封。解不开才交给 assertUsable 认是哪种失败。
   */
  private async api(access: EhAccess, payload: object): Promise<Record<string, unknown>> {
    const response = await this.read(SITES[access.site].api, cookieHeader(access.credential), JSON.stringify(payload))
    let parsed: unknown
    try {
      parsed = JSON.parse(response.body)
    } catch (error) {
      this.assertUsable(response)
      throw unavailable("e 站接口返回的不是预期的 JSON", error)
    }
    if (response.status === 200 && isRecord(parsed)) {
      return parsed
    }
    this.assertUsable(response)
    throw unavailable("e 站接口返回的不是预期的 JSON", `HTTP ${response.status} url=${response.url}`)
  }

  /** 页面、JSON 接口与凭据探测共用：整个响应读进内存。图片流不走这里。 */
  private async read(url: string, cookie: string, body?: string): Promise<UpstreamResponse> {
    /* 排查「一次操作到底打了几个上游请求」时全靠这条 */
    this.logger.debug(`请求 e 站 ${body === undefined ? "GET" : "POST"} ${url}`)
    try {
      const response = await this.outbound(url, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? { cookie } : { cookie, "content-type": "application/json" },
        body,
      })
      return { url, status: response.status, body: await response.text() }
    } catch (error) {
      throw unreachable(url, error)
    }
  }

  /**
   * 把上游那些「200 但不是内容」的响应翻译成明确的失败。
   *
   * 这几种情况 e 站都回 HTTP 200：只看状态码的话，IP 被封时会被当成正常 HTML 解析出空列表，
   * 然后继续按原节奏请求，把临时封禁续成长期封禁。
   */
  private assertUsable({ url, status, body }: UpstreamResponse) {
    /* 509 是 e 站专门表示图片配额耗尽的状态码，先判它——509 的响应体也可能是空的 */
    if (status === 509) {
      throw quotaExceeded()
    }
    /* 封禁页是一句不带任何标签的纯文本。只认这个形状：正常页面里的标题、评论、回显的搜索词出现同样的字眼不算 */
    if (!body.includes("<") && (body.includes("temporarily banned") || body.includes("excessive pageloads"))) {
      throw banned(url)
    }
    if (status >= 500) {
      throw unavailable("e 站那边出错了", `HTTP ${status} url=${url}`)
    }
    if (body.trim() === "") {
      /* 里站在 Cookie 无效或账号无权限时回空 body（200，或 302 回表站），不是 403；表站回空页面则是出口 IP 被封了 */
      if (url.startsWith(SITES.ex.page) || url.startsWith(SITES.ex.api)) {
        throw sadPanda()
      }
      if (status === 200) {
        throw banned(url)
      }
    }
    /* 正常的页面请求不会重定向，会重定向说明身份没被认下来 */
    if (status >= 300) {
      throw unavailable("e 站返回了意料之外的响应", `HTTP ${status} url=${url}`)
    }
  }

  /**
   * 页面没解析出要的东西时，先认一认是不是 e 站那几种代替页面的说明，认不出来才按版面改了报告。
   * 放在解析失败之后才认：正常页面里的标题、评论也可能出现这些字眼，先按文案判断会误伤。
   */
  private unrecognized({ url, body }: UpstreamResponse, fallback: string): never {
    /* 被标记的图集在没有 nw cookie 时回一张插页 */
    if (body.includes("Content Warning")) {
      throw contentWarning(url)
    }
    const notice = parseNotice(body)
    if (notice) {
      throw upstreamNotice(notice)
    }
    throw unavailable(fallback, `url=${url}`)
  }
}

/** JSON 里的一个对象（不含数组与 null）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 配额用尽时的提示图不能当成这一页的内容返回，更不能缓存下来。 */
function withinQuota(image: ImagePage): ImagePage {
  if (QUOTA_IMAGE.test(image.imageUrl)) {
    throw quotaExceeded()
  }
  return image
}

/**
 * 上游的数字、HTML 实体与时间在协议边界统一转换。e 站 JSON 里数字的写法不统一：gid 是数字，filecount、rating
 * 这些是字符串（"329"、"4.68"）。两种都收下；缺省、null 和空串都算 0，别让一个没填的字段废掉整批元数据。
 */
function toMetadata(entry: Record<string, unknown>): GalleryMetadata {
  const text = (field: string) => {
    const value = entry[field]
    return typeof value === "string" ? value : ""
  }
  const number = (field: string) => {
    const value = entry[field]
    if (value === undefined || value === null || value === "") {
      return 0
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      throw unavailable("e 站元数据的格式不对", `${field}=${String(value)}`)
    }
    return parsed
  }
  return {
    gid: number("gid"),
    token: text("token"),
    title: decodeEntities(text("title")),
    titleJpn: decodeEntities(text("title_jpn")),
    category: text("category"),
    thumbnailUrl: text("thumb"),
    uploader: text("uploader"),
    postedAt: new Date(number("posted") * 1000).toISOString(),
    fileCount: number("filecount"),
    rating: number("rating"),
    tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => decodeEntities(String(tag))) : [],
    fileSize: number("filesize"),
    torrentCount: number("torrentcount"),
    expunged: entry.expunged === true,
  }
}
