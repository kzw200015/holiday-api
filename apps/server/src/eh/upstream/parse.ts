import type { CommentSegment, GalleryComment, GalleryComments, GalleryPreview } from "@myapi/shared/eh"
import { load, type Cheerio, type CheerioAPI } from "cheerio"
import type { AnyNode, Element } from "domhandler"
import { decodeHTMLStrict } from "entities"

import { galleryOfLink, imagePageOfLink, type GalleryRef } from "@server/eh/upstream/gallery-ref"
import { onPublicThumbnailHost } from "@server/eh/upstream/image-hosts"
import { isDecimal } from "@server/numeric"

/*
 * 解析只由 HTML 提供的东西：图集列表、取图用的定位信息、预览图与评论。不发请求、不碰缓存。
 * 这是整套东西里最脆的一层，e 站随时可能改版面；测试里的样本全是从真实页面裁下来的。
 *
 * 一律先按页面结构找到元素（id、class 与层级，和 EhViewer、JHenTai 这些客户端认的是同一套），再从它的属性与文字里取值：
 * 链接按 URL 的路径分段认（gallery-ref.ts），内联样式先由 cheerio 拆成各个属性，单个属性值或一段文字的格式用锚定的小正则认。
 * 不拿正则扫整页：评论区里贴的别的图集的链接、标题与评论里的字眼都会被一起扫进来。
 */

/** 搜索结果一页的图集顺序；nextCursor 为 null 表示已经是最后一页。 */
export interface GalleryList {
  refs: GalleryRef[]
  nextCursor: string | null
}

/** 详情页上的一张预览图，地址还是上游的。 */
export type PreviewImage = Omit<GalleryPreview, "url"> & { imageUrl: string }

/** 详情页的一个分片：取图要用的页令牌与分片大小，外加这一片上的预览图与评论（评论每片都带着一份，只用第 0 片的）。 */
export interface GallerySlice {
  pageTokens: Map<number, string>
  /**
   * 账号的分片大小：一片默认列 20 个令牌，登录用户能调成 40/50，由「Showing 1 - 20 of 329」那行推出。
   * 最后一片可能不满，只有后面还有页的分片能确定；确定不了是 null。
   */
  sliceSize: number | null
  /** 整本的页数，同样取自那一行；没有那一行是 null。 */
  pageCount: number | null
  previews: PreviewImage[]
  comments: GalleryComments
}

/** 图片页（/s/ 页面或 showpage 接口的 i3 片段）里取图要用的东西。 */
export interface ImagePage {
  imageUrl: string
  showKey: string | null
  /** 顺带给出的下一页令牌：顺序阅读时就不用再回头请求详情页了。 */
  next: { page: number; token: string } | null
  /** 图床节点失效时靠它换一台机器重取。 */
  reloadToken: string | null
}

/** e 站实体解码：只认带分号的写法，标题里的 `&notreal;` 这类字面量不会被改写。 */
export const decodeEntities = decodeHTMLStrict

/**
 * 搜索没有结果时的两种说法：真没命中，或者这一页的结果全被账号的过滤设置（语言、标签排除）滤掉了。
 * 后一种不是版面改了，下一页照样可能有结果。
 */
const EMPTY_LIST_MARKERS = ["No hits found", "No unfiltered results"]

/**
 * 搜索结果页，只取图集顺序和下一页游标。认不出任何图集、又不是「没有结果」，就是版面改了，返回 null。
 *
 * 结果都在 .itg 里：Compact 等模式下它是表格，缩略图模式下是一组 div，所以不认层级，只收它里面指向图集的链接。
 */
export function parseGalleryList(html: string): GalleryList | null {
  const $ = load(html)
  /* 同一个图集在一行里会出现在封面、标题等多个链接上，按 gid 去重后顺序即页面顺序 */
  const refs = new Map<number, GalleryRef>()
  for (const link of $(".itg a[href]").toArray()) {
    const ref = galleryOfLink($(link).attr("href"))
    if (ref && !refs.has(ref.gid)) {
      refs.set(ref.gid, ref)
    }
  }
  if (refs.size === 0) {
    const text = $.root().text()
    if (!EMPTY_LIST_MARKERS.some((marker) => text.includes(marker))) {
      return null
    }
  }
  /* 翻到最后一页时 unext 从 <a> 变成 <span>，没有 href */
  const next = URL.parse($("#unext").attr("href") ?? "")?.searchParams.get("next")
  return { refs: [...refs.values()], nextCursor: next || null }
}

/**
 * 详情页的一个分片。#gdt 里每页一格：一个指向图片页的链接，里面有一张用背景图显示的预览图；
 * 「Showing 1 - 20 of 329 images」在 .gpc 里；评论在 #cdiv 里。
 * #gdt 里只有这本图集的页，每页一格；gid 对不上的链接照样不收。
 */
export function parseGallerySlice(html: string, gid: number): GallerySlice {
  const $ = load(html)
  const pageTokens = new Map<number, string>()
  const previews: PreviewImage[] = []
  for (const link of $("#gdt a[href]").toArray()) {
    const target = imagePageOfLink($(link).attr("href"))
    if (!target || target.gid !== gid) {
      continue
    }
    pageTokens.set(target.page, target.token)
    const preview = parsePreview($(link), target.page)
    if (preview) {
      previews.push(preview)
    }
  }
  const [from, to, total] = numbersIn($(".gpc").first().text())
  const comments = parseComments($)
  if (from === undefined || to === undefined || total === undefined) {
    return { pageTokens, sliceSize: null, pageCount: null, previews, comments }
  }
  return {
    pageTokens,
    /* 本片之后还有页，才说明本片是满的；总页数只能从这一行取，不能拿令牌个数顶 */
    sliceSize: from >= 1 && from <= to && to < total ? to - from + 1 : null,
    pageCount: total > 0 ? total : null,
    previews,
    comments,
  }
}

const PIXELS = /^(\d+)px$/
/* 背景简写 `transparent url(…) -200px 0 no-repeat` 里的图片地址与横纵偏移 */
const BACKGROUND = /url\(([^)]+)\)\s+(-?\d+)(?:px)?\s+(-?\d+)(?:px)?/

/**
 * 一格预览图。背景图显示在格子里的一个 div 上（登录后的页面在它外面还多包一层、旁边带着页码，所以按 style 找，不认层级）：
 * 一页一张时背景图就是这一页，偏移为 0；账号设成普通尺寸时是一片拼成的一张图，靠负的背景偏移露出这一页。
 * 认不出尺寸或地址的跳过。
 */
function parsePreview(link: Cheerio<Element>, page: number): PreviewImage | null {
  const cell = link.find("div[style]").first()
  const [, width] = PIXELS.exec(cell.css("width") ?? "") ?? []
  const [, height] = PIXELS.exec(cell.css("height") ?? "") ?? []
  const [, imageUrl, x, y] = BACKGROUND.exec(cell.css("background") ?? "") ?? []
  if (!width || !height || !imageUrl || !x || !y) {
    return null
  }
  return {
    page,
    imageUrl: onPublicThumbnailHost(imageUrl),
    width: Number(width),
    height: Number(height),
    /* 背景偏移是负的，换成「从图上哪里裁」；写成 0 的也不留下 -0 */
    offsetX: Math.abs(Number(x)),
    offsetY: Math.abs(Number(y)),
  }
}

/**
 * 图片页或 showpage 接口的 i3 片段。找不到大图时返回 null。
 *
 * 大图外面套着的链接指向下一页：图片页上方还有一排翻页导航，所以要取紧挨着大图的那个，不能取页面上第一个。
 * 换源令牌是大图 onerror 里 nl() 的参数（图片页与 i3 片段都有），showkey 是页面脚本里的一个变量。
 */
export function parseImagePage(html: string): ImagePage | null {
  const $ = load(html)
  const image = $("img#img")
  const imageUrl = image.attr("src")
  if (!imageUrl) {
    return null
  }
  const next = imagePageOfLink(image.parent("a").attr("href"))
  return {
    imageUrl,
    showKey: /var\s+showkey\s*=\s*"([^"]+)"/.exec($("script").text())?.[1] ?? null,
    next: next ? { page: next.page, token: next.token } : null,
    reloadToken: /nl\('([^']+)'\)/.exec(image.attr("onerror") ?? "")?.[1] ?? null,
  }
}

/**
 * e 站用一段说明代替页面时的说明文字，不是这种页面时返回 null。
 * 图集被删或转私有是 div.d 里的一段；令牌不对、页码越界是一句不带任何标签的纯文本（Key missing、Invalid page）。
 */
export function parseNotice(html: string): string | null {
  const text = html.includes("<") ? load(html)("div.d p").first().text() : decodeEntities(html)
  return text.trim().slice(0, 200) || null
}

/** 分片页面上的评论，外加没列出来的低分评论条数。 */
function parseComments($: CheerioAPI): GalleryComments {
  const comments = $("#cdiv .c1")
    .toArray()
    .map((block): GalleryComment => {
      const comment = $(block)
      const meta = comment.find(".c3").first()
      const body = comment.find(".c6").first()
      const id = /^comment_(\d+)$/.exec(body.attr("id") ?? "")?.[1]
      return {
        id: Number(id ?? 0),
        author: meta.find("a").first().text().trim(),
        postedAt: parsePostedAt(meta.text()),
        /*
         * 上传者留言的正文固定是 comment_0。不能看有没有 .c4：没登录时只有上传者留言有这格（写着 Uploader Comment），
         * 登录后每条普通评论的同一位置都是 Vote+ / Vote- 投票链接。
         */
        isUploader: id === "0",
        /* 「Score <span>+7</span>」，上传者留言没有这格 */
        score: comment.find(".c5 span").first().text().trim(),
        segments: parseSegments($, body),
      }
    })
  /* 评论区末尾那句 There are 33 more comments below the viewing threshold；没有藏起来的评论时没有这句 */
  const threshold = $("#chd p")
    .filter((_, p) => $(p).text().includes("below the viewing threshold"))
    .first()
    .text()
  return { comments, hiddenCount: numbersIn(threshold)[0] ?? 0 }
}

const MONTHS = [
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

/** .c3 的文字形如 `Posted on 28 May 2022, 01:53 by: 作者`，页面上写的是 UTC。解析不出来是空串，让前端显示占位而不是崩掉。 */
function parsePostedAt(text: string): string {
  const [, day, monthName, year, hour, minute] =
    /^Posted on (\d{1,2}) (\w+) (\d{4}), (\d{2}):(\d{2})/.exec(text.trim()) ?? []
  const month = MONTHS.indexOf(monthName ?? "")
  if (!day || !year || !hour || !minute || month < 0) {
    return ""
  }
  return new Date(Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute))).toISOString()
}

/* HTML 意义上的空白，不含 &nbsp;：评论里用 &nbsp; 刻意排出来的空格要留着 */
const WHITESPACE = /[ \t\n\r\f]+/g

/**
 * 把评论正文拍平成文本、换行与链接片段，交给前端的模板渲染，前端从不插入 HTML。
 * 链接只放行 http/https，javascript: 和 data: 一律降级成普通文字。
 * 空白按浏览器显示的样子整理：连续空白折成一个空格，每行首尾的空白去掉。
 */
function parseSegments($: CheerioAPI, body: Cheerio<AnyNode>): CommentSegment[] {
  const segments: CommentSegment[] = []
  const addText = (text: string) => {
    const last = segments.at(-1)
    if (last?.type === "text") {
      last.text += text
    } else {
      segments.push({ type: "text", text })
    }
  }
  const walk = (element: Cheerio<AnyNode>) => {
    element.contents().each((_, node) => {
      if (node.type === "text") {
        addText(node.data)
      } else if (node.type === "tag" && node.name === "br") {
        segments.push({ type: "break" })
      } else if (node.type === "tag" && node.name === "a") {
        const href = $(node).attr("href") ?? ""
        const text = $(node).text()
        if (href.startsWith("http://") || href.startsWith("https://")) {
          segments.push({ type: "link", text: text.replace(WHITESPACE, " ").trim(), href })
        } else {
          addText(text)
        }
      } else if (node.type === "tag") {
        walk($(node))
      }
    })
  }
  walk(body)

  return segments.flatMap((segment, index): CommentSegment[] => {
    if (segment.type !== "text") {
      return [segment]
    }
    let text = segment.text.replace(WHITESPACE, " ")
    /* 行首行尾：前后没有片段，或者挨着换行 */
    const previous = segments[index - 1]
    const next = segments[index + 1]
    if (!previous || previous.type === "break") {
      text = text.trimStart()
    }
    if (!next || next.type === "break") {
      text = text.trimEnd()
    }
    return text ? [{ type: "text", text }] : []
  })
}

/** 文字里按空白分开的每个十进制数，千分位的逗号去掉：「Showing 1 - 20 of 1,034 images」是 1、20、1034。 */
function numbersIn(text: string): number[] {
  return text.replaceAll(",", "").split(WHITESPACE).filter(isDecimal).map(Number)
}
