import type { CommentSegment, GalleryComment, GalleryComments, GalleryPreview } from "@myapi/shared/eh"
import { load, type Cheerio, type CheerioAPI } from "cheerio"
import type { AnyNode } from "domhandler"
import { decodeHTMLStrict } from "entities"

import type { GalleryRef } from "@/eh/upstream/gallery-ref"
import { onPublicThumbnailHost } from "@/eh/upstream/image-hosts"

/*
 * 解析只由 HTML 提供的东西：图集列表、取图用的定位信息、预览图与评论。不发请求、不碰缓存。
 * 这是整套东西里最脆的一层，e 站随时可能改版面；测试里的样本全是从真实页面裁下来的。
 *
 * 有稳定 id 的元素（大图、预览图、评论）用选择器取；散落在各处的链接用正则扫全文，
 * 因为搜索结果有好几种显示模式，有的模式下整个表格都不存在，只有链接的形状是不变的。
 * 搜索结果页只要一个下一页链接，也用正则取，免得每次搜索都为它把整页建成 DOM。
 */

/** 搜索结果一页的图集顺序；nextCursor 为 null 表示已经是最后一页。 */
export interface GalleryList {
  refs: GalleryRef[]
  nextCursor: string | null
}

/** 详情页的一个分片里跟取图有关的部分，外加整页 HTML（评论要用）。 */
export interface GallerySlice {
  html: string
  pageTokens: Map<number, string>
  /**
   * 账号的分片大小：一片默认列 20 个令牌，登录用户能调成 40/50，由「Showing 1 - 20 of 329」那行推出。
   * 最后一片可能不满，只有后面还有页的分片能确定；确定不了是 null。
   */
  sliceSize: number | null
  /** 整本的页数，同样取自那一行；没有那一行是 null。 */
  pageCount: number | null
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

const GALLERY_LINK = /\/g\/(\d+)\/([0-9a-f]{10})\//g
const NEXT_LINK = /<a\b[^>]*\bid="unext"[^>]*>/
const HREF = /\bhref="([^"]*)"/

/**
 * 搜索没有结果时的两种说法：真没命中，或者这一页的结果全被账号的过滤设置（语言、标签排除）滤掉了。
 * 后一种不是版面改了，下一页照样可能有结果。
 */
const EMPTY_LIST_MARKERS = ["No hits found", "No unfiltered results"]

/** 搜索结果页，只取图集顺序和下一页游标。认不出任何图集、又不是「没有结果」，就是版面改了，返回 null。 */
export function parseGalleryList(html: string): GalleryList | null {
  /* 同一个图集在一行里会出现在封面、标题等多个链接上，按 gid 去重后顺序即页面顺序 */
  const refs = new Map<number, GalleryRef>()
  for (const [, gid, token] of html.matchAll(GALLERY_LINK)) {
    if (gid && token && !refs.has(Number(gid))) {
      refs.set(Number(gid), { gid: Number(gid), token })
    }
  }
  if (refs.size === 0 && !EMPTY_LIST_MARKERS.some((marker) => html.includes(marker))) {
    return null
  }
  /* 翻到最后一页时 unext 从 <a> 变成 <span>，没有 href */
  const href = HREF.exec(NEXT_LINK.exec(html)?.[0] ?? "")?.[1]
  const next = href ? new URL(decodeEntities(href), "https://e-hentai.org").searchParams.get("next") : null
  return { refs: [...refs.values()], nextCursor: next || null }
}

const IMAGE_PAGE_LINK = /\/s\/([0-9a-f]{10})\/(\d+)-(\d+)/g
const SHOWING = /Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)/

/**
 * 详情页一个分片里这本图集的每页令牌、分片大小与总页数。
 * 只收 gid 对得上的链接：评论区也在这页上，里面贴的别的图集的图片页链接不能混进来。
 */
export function parseGallerySlice(html: string, gid: number): GallerySlice {
  const pageTokens = new Map<number, string>()
  for (const [, token, linkGid, page] of html.matchAll(IMAGE_PAGE_LINK)) {
    if (token && page && Number(linkGid) === gid && !pageTokens.has(Number(page))) {
      pageTokens.set(Number(page), token)
    }
  }
  const [from, to, total] = (SHOWING.exec(html) ?? []).slice(1).map((number) => Number(number.replaceAll(",", "")))
  if (from === undefined || to === undefined || total === undefined) {
    return { html, pageTokens, sliceSize: null, pageCount: null }
  }
  return {
    html,
    pageTokens,
    /* 本片之后还有页，才说明本片是满的；总页数只能从这一行取，不能拿令牌个数顶 */
    sliceSize: from >= 1 && from <= to && to < total ? to - from + 1 : null,
    pageCount: total > 0 ? total : null,
  }
}

/** 详情页上的一张预览图，地址还是上游的。 */
export type PreviewImage = Omit<GalleryPreview, "url"> & { imageUrl: string }

const PREVIEW_STYLE = /url\(([^)]+)\)\s*(-?\d+)(?:px)?\s+(-?\d+)(?:px)?/

/**
 * 详情页一个分片里的预览图，按页面顺序。每张是 #gdt 里一个指向图片页的链接，里面有一个用背景图显示的 div
 * （登录后的页面在它外面还多包一层、旁边带着页码，所以按 style 找，不认层级）：
 * 一页一张时背景图就是这一页，偏移为 0；账号设成普通尺寸时是一片拼成的一张图，靠负的背景偏移露出这一页。
 * 和页令牌一样只收 gid 对得上的链接；认不出尺寸或地址的跳过。
 */
export function parseGalleryPreviews(html: string, gid: number): PreviewImage[] {
  const $ = load(html)
  return $("#gdt a")
    .toArray()
    .flatMap((link) => {
      const [, linkGid, page] = /\/s\/[0-9a-f]{10}\/(\d+)-(\d+)/.exec($(link).attr("href") ?? "") ?? []
      const style = $(link).find("div[style]").first().attr("style") ?? ""
      const width = /width:\s*(\d+)px/.exec(style)?.[1]
      const height = /height:\s*(\d+)px/.exec(style)?.[1]
      const [, imageUrl, x, y] = PREVIEW_STYLE.exec(style) ?? []
      if (Number(linkGid) !== gid || !page || !width || !height || !imageUrl || !x || !y) {
        return []
      }
      return [
        {
          page: Number(page),
          imageUrl: onPublicThumbnailHost(imageUrl),
          width: Number(width),
          height: Number(height),
          /* 背景偏移是负的，换成「从图上哪里裁」；写成 0 的也不留下 -0 */
          offsetX: Math.abs(Number(x)),
          offsetY: Math.abs(Number(y)),
        },
      ]
    })
}

/**
 * 图片页或 showpage 接口的 i3 片段。找不到大图时返回 null。
 *
 * 大图外面套着的链接指向下一页：图片页上方还有一排翻页导航，所以要取紧挨着大图的那个，不能取页面上第一个。
 * 换源令牌挂在大图的 onerror 或「加载失败」链接上，showkey 在页面脚本里，都按原文的形状取。
 */
export function parseImagePage(html: string): ImagePage | null {
  const $ = load(html)
  const image = $("img#img")
  const imageUrl = image.attr("src")
  if (!imageUrl) {
    return null
  }
  const [, nextToken, nextPage] = /\/s\/([0-9a-f]{10})\/\d+-(\d+)/.exec(image.parent("a").attr("href") ?? "") ?? []
  return {
    imageUrl,
    showKey: /var\s+showkey\s*=\s*"([^"]+)"/.exec(html)?.[1] ?? null,
    next: nextToken && nextPage ? { page: Number(nextPage), token: nextToken } : null,
    reloadToken: /nl\('([^']+)'\)/.exec(html)?.[1] ?? null,
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

/** 详情页里的评论，外加没列出来的低分评论条数（评论区末尾那句 There are 33 more comments below the viewing threshold）。 */
export function parseGalleryComments(html: string): GalleryComments {
  const $ = load(html)
  const hidden = /There (?:are|is) ([\d,]+) more comments? below/.exec($("#chd").text())?.[1]
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
        score: comment
          .find(".c5")
          .first()
          .text()
          .replace(/^\s*Score/, "")
          .trim(),
        segments: parseSegments($, body),
      }
    })
  return { comments, hiddenCount: hidden ? Number(hidden.replaceAll(",", "")) : 0 }
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

/** 评论时间形如 `28 May 2022, 01:53`，页面上写的是 UTC。解析不出来是空串，让前端显示占位而不是崩掉。 */
function parsePostedAt(text: string): string {
  const [, day, monthName, year, hour, minute] = /Posted on (\d{1,2}) (\w+) (\d{4}), (\d{2}):(\d{2})/.exec(text) ?? []
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
