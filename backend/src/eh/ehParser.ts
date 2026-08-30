import { type CheerioAPI, load } from "cheerio"
import { decodeHTMLStrict } from "entities"
import type { CommentSegment, GalleryComment, GalleryRef } from "./ehModels"

/**
 * e 站页面的解析。全是纯函数：输入 HTML 字符串，输出结构化数据，不发请求、不碰缓存。
 * 这样最脆的一层能用抓下来的真实页面做 fixture 单测（见 __fixtures__/）。
 *
 * 能走 JSON API 拿到的东西一律不在这里解析——标题、标签、分类、总页数都来自 gdata，
 * 剩下真正只有 HTML 才有的就三样：列表页的图集序列、详情页的每页 token 与评论、图片页的 showkey。
 */

/**
 * 图集链接。不挑 `td.gl3c.glname` 这类选择器是因为搜索结果有 5 种显示模式，
 * 由账号设置决定：Thumbnail 模式下整个 <table> 都不存在。全文正则抓链接对所有模式都成立。
 */
const GALLERY_LINK_RE = /\/g\/(\d+)\/([0-9a-f]{10})\//g

/** 图片页链接，形如 /s/<ptoken>/<gid>-<页码>。 */
const IMAGE_PAGE_LINK_RE = /\/s\/([0-9a-f]{10})\/\d+-(\d+)/g

/** 详情页上的「Showing 1 - 20 of 329」。数字过千会带千分位逗号。 */
const SHOWING_RE = /Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)/

/**
 * 大图本身。图片页和 showpage 的 i3 片段用的是同一个标签，所以共用这一条。
 * 不能加 g 标志：带 g 的正则 exec 会记住 lastIndex，两处轮流调用就会互相错位。
 */
const MAIN_IMAGE_RE = /<img[^>]*\bid="img"[^>]*\bsrc="([^"]+)"/

/** 评论时间，形如 `28 May 2022, 01:53`，页面上写的是 UTC。 */
const POSTED_AT_RE = /Posted on (\d{1,2}) (\w+) (\d{4}), (\d{2}):(\d{2})/

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/**
 * 解码 HTML 实体。
 * gdata 返回的 title 和 tags 也是转义过的（实测有 `Arcueid &amp; Ciel x Goblin`），
 * 那边没有 DOM 可用，所以这个函数要能独立处理纯字符串。
 *
 * 用 strict 版（实体必须带分号）而不是 decodeHTML：后者按 HTML5 的历史兼容规则，
 * 会把 `&notreal;` 里的 `&not` 也当成实体解掉，标题里出现这种字面量就被改写了。
 */
export const decodeEntities = decodeHTMLStrict

/**
 * 把字符串从它的来源里摘出来，复制成独立的一份。
 *
 * JavaScriptCore 对正则捕获组返回的是共享父串缓冲区的子串，不是副本。这些短字符串
 * （每页令牌、showkey、图片地址）会被 ehService 放进 20~30 分钟 TTL 的缓存，不摘的话
 * 每一条缓存都把它来源的那整页 HTML 一起钉在内存里——实测 300 条 46 字符的捕获占了 32 MB。
 * 只有 Buffer 往返能真的断开引用，`(s + " ").slice(0, -1)` 这类写法实测无效。
 */
function detach(text: string): string {
  return Buffer.from(text, "utf8").toString()
}

/** 页面的实际含义。这几种情况 e 站都回 HTTP 200，只看状态码会把它们当成正常页面去解析。 */
export type ResponseKind = "ok" | "empty" | "contentWarning" | "sadPanda" | "ipBanned" | "quotaExceeded"

/**
 * 判断一个响应到底是什么。
 *
 * 「200 但不是你要的东西」有好几种，全都必须识别出来：
 * 只看 response.ok 的话，IP 被封时会被当成正常 HTML 解析出空列表，
 * 然后继续按原节奏请求，把临时封禁续成长期封禁。
 */
export function classifyResponse({ status, body }: { status: number; body: string }): ResponseKind {
  // 509 是 e 站专门用来表示图片配额耗尽的状态码
  if (status === 509) {
    return "quotaExceeded"
  }
  // 里站在 Cookie 无效或账号无权限时回 200 + 空 body，不是 403
  if (body.trim().length === 0) {
    return "sadPanda"
  }
  if (/temporarily banned|excessive pageloads/i.test(body)) {
    return "ipBanned"
  }
  // 被标记的图集在没有 nw cookie 时回一张插页，正文里既没有 #gdt 也没有 #cdiv
  if (/Content Warning/i.test(body)) {
    return "contentWarning"
  }
  if (/No hits found/i.test(body)) {
    return "empty"
  }
  return "ok"
}

/** 解析搜索结果页，只取图集序列和下一页游标。 */
export function parseGalleryList(html: string): { items: GalleryRef[]; nextCursor: string | null } {
  const seen = new Set<number>()
  const items: GalleryRef[] = []

  for (const match of html.matchAll(GALLERY_LINK_RE)) {
    const [, gidText, token] = match
    if (!gidText || !token) {
      continue
    }
    const gid = Number(gidText)
    // 同一个图集在一行里会出现在多个链接上（封面、标题），按 gid 去重后顺序即页面顺序
    if (seen.has(gid)) {
      continue
    }
    seen.add(gid)
    items.push({ gid, token })
  }

  return { items, nextCursor: parseNextCursor(html) }
}

/**
 * 解析图集详情页里的每页 token、总页数与分片区间。全是正则，不建 DOM。
 *
 * 和评论分开是因为取图链路每翻一片就要走一次这里，而它不要评论；
 * 实测 cheerio 的 load() 对一页 74 KB 的详情页要同步阻塞 3 毫秒，正则版只要 0.01 毫秒，
 * 这 3 毫秒卡在事件循环上，而那时候通常正有几十路图片在流式转发。
 *
 * 一页详情只带 20 个 token（登录用户能调成 40/50），所以总页数要另外从 Showing 那行取，
 * 不能拿 pageTokens.length 当总数。
 */
export function parseGalleryPage(html: string): {
  pageTokens: { page: number; token: string }[]
  totalPages: number | null
  /** 本片覆盖的页码区间（Showing 里的那两个数），用来推算真实的分片大小。 */
  range: { from: number; to: number } | null
} {
  const seen = new Set<number>()
  const pageTokens: { page: number; token: string }[] = []

  for (const match of html.matchAll(IMAGE_PAGE_LINK_RE)) {
    const [, token, pageText] = match
    if (!token || !pageText) {
      continue
    }
    const page = Number(pageText)
    if (seen.has(page)) {
      continue
    }
    seen.add(page)
    pageTokens.push({ page, token: detach(token) })
  }

  const showing = SHOWING_RE.exec(html)
  const toNumber = (text: string | undefined) => (text ? Number(text.replaceAll(",", "")) : null)
  const from = toNumber(showing?.[1])
  const to = toNumber(showing?.[2])

  return {
    pageTokens,
    totalPages: toNumber(showing?.[3]),
    range: from !== null && to !== null ? { from, to } : null,
  }
}

/** 解析详情页里的评论。只有评论接口会调，因为它是这里唯一需要建 DOM 的东西。 */
export function parseGalleryComments(html: string): GalleryComment[] {
  return parseComments(load(html))
}

/** 解析图片页。reloadToken 用于图床节点失效时换一台机器重取。 */
export function parseImagePage(html: string): {
  showKey: string | null
  imageUrl: string | null
  reloadToken: string | null
} {
  const showKey = /var\s+showkey\s*=\s*"([^"]+)"/.exec(html)?.[1]
  const imageUrl = MAIN_IMAGE_RE.exec(html)?.[1]
  const reloadToken = /nl\('([^']+)'\)/.exec(html)?.[1]

  return {
    showKey: showKey ? detach(showKey) : null,
    imageUrl: imageUrl ? detach(imageUrl) : null,
    reloadToken: reloadToken ? detach(reloadToken) : null,
  }
}

/**
 * 解析 showpage 接口返回的 i3 片段。
 *
 * i3 里除了本页的图片地址，还带着指向下一页的链接——顺序阅读时下一页的 token 就白送了，
 * 不用再回头请求详情页。这是整条取图链路上最省请求的一处。
 */
export function parseShowPageFragment(i3: string): {
  imageUrl: string | null
  nextPage: { page: number; token: string } | null
} {
  const next = IMAGE_PAGE_LINK_RE.exec(i3)
  // exec 配合带 g 标志的正则会记住 lastIndex，用完必须归零，否则下次调用从中间开始找
  IMAGE_PAGE_LINK_RE.lastIndex = 0

  const token = next?.[1]
  const pageText = next?.[2]
  const imageUrl = MAIN_IMAGE_RE.exec(i3)?.[1]

  return {
    imageUrl: imageUrl ? detach(imageUrl) : null,
    nextPage: token && pageText ? { page: Number(pageText), token: detach(token) } : null,
  }
}

/** 从分页导航里取下一页游标。翻到最后一页时 unext 会变成 <span>，没有 href，这里自然返回 null。 */
function parseNextCursor(html: string): string | null {
  const href = /<a[^>]*\bid="unext"[^>]*\bhref="([^"]*)"/.exec(html)?.[1]
  if (!href) {
    return null
  }
  // href 里的 & 是 &amp; 实体形式，先解码再交给 URLSearchParams
  const query = decodeEntities(href).split("?")[1]
  return query ? new URLSearchParams(query).get("next") : null
}

function parseComments($: CheerioAPI): GalleryComment[] {
  return $("#cdiv .c1")
    .toArray()
    .map((element) => {
      const block = $(element)
      const meta = block.find(".c3").first()
      const body = block.find(".c6").first()

      return {
        id: Number(/comment_(\d+)/.exec(body.attr("id") ?? "")?.[1] ?? 0),
        author: meta.find("a").first().text().trim(),
        postedAt: parsePostedAt(meta.text()),
        // 上传者留言用 .c4 写着 Uploader Comment，其余条目那个位置是 .c5 的分数
        isUploader: block.find(".c4").length > 0,
        score: block
          .find(".c5")
          .first()
          .text()
          .replace(/^\s*Score\s*/, "")
          .trim(),
        segments: parseSegments(body.contents().toArray() as HtmlNode[]),
      }
    })
}

/** 把 `28 May 2022, 01:53` 转成 ISO 字符串。解析不出来时返回空串，让前端显示原始占位而不是崩掉。 */
function parsePostedAt(text: string): string {
  const match = POSTED_AT_RE.exec(text)
  if (!match) {
    return ""
  }
  const [, day, monthName, year, hour, minute] = match
  const month = MONTH_NAMES.indexOf(monthName ?? "")
  if (month < 0) {
    return ""
  }
  return new Date(Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute))).toISOString()
}

/**
 * 解析用到的 DOM 节点字段。只声明这几项，省得为了类型再直接依赖 cheerio 底下的 domhandler
 * （那是传递依赖，直接 import 会在它被换掉时突然断掉）。
 */
interface HtmlNode {
  type?: string
  data?: string
  name?: string
  attribs?: Record<string, string>
  children?: HtmlNode[]
}

/** 把评论正文的 DOM 拍平成片段数组，顺带把 javascript: 这类链接降级成纯文本。 */
function parseSegments(nodes: HtmlNode[]): CommentSegment[] {
  const segments: CommentSegment[] = []

  const walk = (children: HtmlNode[]): void => {
    for (const node of children) {
      if (node.type === "text") {
        if (node.data) {
          segments.push({ type: "text", text: node.data })
        }
        continue
      }
      if (node.type !== "tag") {
        continue
      }
      if (node.name === "br") {
        segments.push({ type: "break" })
        continue
      }
      if (node.name === "a") {
        const href = node.attribs?.href ?? ""
        const text = collectText(node)
        // 只放行 http/https，javascript: 和 data: 一律降级成普通文字
        segments.push(/^https?:\/\//i.test(href) ? { type: "link", text, href } : { type: "text", text })
        continue
      }
      walk(node.children ?? [])
    }
  }

  walk(nodes)
  return mergeAdjacentText(segments)
}

/** 取一个节点下的全部文本。 */
function collectText(node: HtmlNode): string {
  if (node.type === "text") {
    return node.data ?? ""
  }
  return (node.children ?? []).map(collectText).join("")
}

/** 相邻的文本片段合并成一段，免得前端渲染出一串没必要的节点。 */
function mergeAdjacentText(segments: CommentSegment[]): CommentSegment[] {
  const merged: CommentSegment[] = []
  for (const segment of segments) {
    const previous = merged[merged.length - 1]
    if (segment.type === "text" && previous?.type === "text") {
      previous.text += segment.text
      continue
    }
    merged.push(segment)
  }
  return merged
}
