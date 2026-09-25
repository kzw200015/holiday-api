import { z } from "zod"

import { utf8Length } from "./text"

/* ---------- 规则里的数 ---------- */

/** 搜索词的字节上限。搜索历史存的就是搜过的词，两处共用这一份：各写各的，能搜的词就可能存不进历史。 */
export const KEYWORD_MAX_BYTES = 200

/** 搜索历史最多留几条。 */
export const SEARCH_HISTORY_LIMIT = 10

/** 自动翻页间隔的取值范围，单位秒。 */
export const READER_INTERVAL_MIN = 1
export const READER_INTERVAL_MAX = 20

/** 页码与上报序号落在 PostgreSQL 的 integer 列里。 */
const INT32_MAX = 2_147_483_647

/**
 * 图集分类，也是搜索与偏好里认的名字。e 站的分类就这十个，服务端据此换算筛选参数，前端据此列筛选项。
 */
export const GALLERY_CATEGORIES = [
  "doujinshi",
  "manga",
  "artistcg",
  "gamecg",
  "western",
  "non-h",
  "imageset",
  "cosplay",
  "asianporn",
  "misc",
] as const

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number]

/* ---------- 各处共用的字段 ---------- */

const categorySchema = z.enum(GALLERY_CATEGORIES, { error: "分类名不合法" })

/** 图集编号。它会被拼进上游地址，所以从外部来的都得先过这一道。 */
export const gidSchema = z.int({ error: "图集编号不合法" }).positive({ error: "图集编号不合法" })

/** 图集令牌：10 位小写十六进制。 */
export const galleryTokenSchema = z.string({ error: "图集令牌不合法" }).regex(/^[0-9a-f]{10}$/, "图集令牌不合法")

/** 页码从 1 起。 */
export const pageSchema = z
  .int({ error: "页码不合法" })
  .min(1, { error: "页码不合法" })
  .max(INT32_MAX, { error: "页码不合法" })

/** 一个搜索词。去两端空白由前端在提交前做，这里原样校验。 */
export const keywordSchema = z
  .string({ error: "关键词太长了" })
  .refine((keyword) => utf8Length(keyword) <= KEYWORD_MAX_BYTES, "关键词太长了")

/* ---------- 请求体 ---------- */

/**
 * 一次搜索的全部条件。分类是一组名字，塞进查询串就得两头各写一份拼拆规则，所以整条走 JSON 请求体。
 */
export const gallerySearchSchema = z.object({
  keyword: keywordSchema.default(""),
  categories: z.array(categorySchema).default([]),
  /** 空串表示第一页；它是 e 站给的一串数字，会被拼进上游地址。 */
  cursor: z
    .string({ error: "分页游标不合法" })
    .regex(/^\d{0,20}$/, "分页游标不合法")
    .default(""),
})

const COOKIE_CHARS = "Cookie 值里有不允许的字符，检查是不是多复制了分号、空格或引号"

/** RFC 6265 的 cookie-octet：可见 ASCII，去掉空格、双引号、逗号、分号和反斜杠。这三个值会被原样拼进 Cookie 请求头。 */
const cookieValue = z
  .string({ error: COOKIE_CHARS })
  .regex(/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/, COOKIE_CHARS)

const REQUIRED_COOKIES = "ipb_member_id 和 ipb_pass_hash 都不能为空"

/**
 * 用户从浏览器复制出来的三个 Cookie，也是绑定接口的请求体。
 *
 * 让人手动粘贴而不是代填账号密码：论坛的登录接口挂在 Cloudflare 盾后面，服务端直接 POST 会被 challenge 拦掉。
 */
export const ehCookieSchema = z.object({
  ipbMemberId: cookieValue.min(1, REQUIRED_COOKIES),
  ipbPassHash: cookieValue.min(1, REQUIRED_COOKIES),
  /** 里站专用，留空则只能看表站 */
  igneous: cookieValue.default(""),
})

const READER_INTERVAL_RULE = `自动翻页间隔应为 ${READER_INTERVAL_MIN}–${READER_INTERVAL_MAX} 秒`

export const readerIntervalSchema = z
  .int({ error: READER_INTERVAL_RULE })
  .min(READER_INTERVAL_MIN, { error: READER_INTERVAL_RULE })
  .max(READER_INTERVAL_MAX, { error: READER_INTERVAL_RULE })

/** 浏览偏好：读接口的响应体。 */
export const galleryPreferencesSchema = z.object({
  categories: z.array(categorySchema),
  readerInterval: readerIntervalSchema,
})

/** 改偏好的请求体：只带要改的字段，没带的保持原样，所以两处各改各的字段不会互相覆盖。 */
export const galleryPreferencesPatchSchema = galleryPreferencesSchema.partial()

/** 还没存过偏好时的样子，与表上的列默认值一致。 */
export const DEFAULT_GALLERY_PREFERENCES: z.output<typeof galleryPreferencesSchema> = {
  categories: [],
  readerInterval: 5,
}

const SEARCH_HISTORY_ENTRY_RULE = `搜索历史关键词应为 1–${KEYWORD_MAX_BYTES} 字节`

/** 搜索历史里的一条。空串存下来没有意义，超长的存不进去。 */
export const searchHistoryEntrySchema = z
  .string({ error: SEARCH_HISTORY_ENTRY_RULE })
  .min(1, SEARCH_HISTORY_ENTRY_RULE)
  .refine((entry) => utf8Length(entry) <= KEYWORD_MAX_BYTES, SEARCH_HISTORY_ENTRY_RULE)

/** 记一个词、删一个词：记的是请求体，删的是查询串。 */
export const searchHistoryKeywordSchema = z.object({ keyword: searchHistoryEntrySchema })

/**
 * 记下一个搜过的词：最近的排最前，同一个词只留一条，总共留 {@link SEARCH_HISTORY_LIMIT} 条。
 * 服务端按它落库，前端按它当场改本地那份，两边是同一条规则。
 */
export function recordSearchKeyword(entries: readonly string[], keyword: string): string[] {
  return [keyword, ...entries.filter((entry) => entry !== keyword)].slice(0, SEARCH_HISTORY_LIMIT)
}

/**
 * 一次阅读进度上报。
 *
 * writer 是上报方（前端的一次页面加载）的标识，seq 是它的第几次上报。前端不排队，当场发出，
 * 同一上报方的两次上报可能乱序到达，服务端按 seq 只认新的那次；不同上报方之间照到达顺序覆盖。
 */
export const readingProgressSchema = z.object({
  gid: gidSchema,
  token: galleryTokenSchema,
  page: pageSchema,
  writer: z.string({ error: "上报方标识不合法" }).min(1, "上报方标识不合法").max(64, "上报方标识不合法"),
  seq: z
    .int({ error: "上报序号不合法" })
    .min(1, { error: "上报序号不合法" })
    .max(INT32_MAX, { error: "上报序号不合法" }),
})

/** 阅读历史的查询参数。游标由服务端编出来、前端原样带回，解开时逐段校验（见服务端的 history-cursor.ts）。 */
export const readingHistoryQuerySchema = z.object({
  cursor: z.string({ error: "阅读历史游标不合法" }).default(""),
})

/* ---------- 响应体 ---------- */

/** 一个标签：原文拆成命名空间与值（female:big breasts），外加两者的中文名。没有译名的，中文名就是原文 */
export interface GalleryTag {
  /** e 站给临时标签不带前缀，归到 temp */
  namespace: string
  namespaceName: string
  value: string
  name: string
}

/** 列表里一张卡片的内容 */
export interface GalleryCard {
  gid: number
  token: string
  title: string
  /** 日文原标题，可能为空 */
  titleJpn: string
  /** e 站的英文分类名，如 Doujinshi */
  category: string
  /** 已经是本站的代理地址，可直接放进 img 的 src */
  thumbnail: string
  uploader: string
  /** ISO 8601 */
  postedAt: string
  fileCount: number
  rating: number
  tags: GalleryTag[]
}

/** 详情接口的返回：比卡片多出几个字段，与卡片的字段平铺在一起。阅读进度另有接口，见 {@link ReadingProgress} */
export interface GalleryDetail extends GalleryCard {
  /** 字节数 */
  fileSize: number
  torrentCount: number
  /** 图集是否已被删除 */
  expunged: boolean
}

/** 某一页大图的签名地址：每页各签各的，阅读器取哪页就签哪页 */
export interface GalleryImageUrlResult {
  /** 直接给 img 的 src 用，前端不解析、不拼改它 */
  url: string
}

/**
 * 图集里一页的预览图。e 站给的要么是一页一张，要么是一片拼成一张（按偏移裁出这一页），两种都按「从这张图的
 * (offsetX, offsetY) 处裁出 width × height」显示，一页一张时偏移为 0。尺寸与偏移都是图上的原始像素
 */
export interface GalleryPreview {
  page: number
  /** 已经是本站的代理地址 */
  url: string
  width: number
  height: number
  offsetX: number
  offsetY: number
}

/** 这个账号在某本图集上读到第几页 */
export interface ReadingProgress {
  /** 从未读过时为 null */
  page: number | null
}

/** 评论正文的片段。服务端拆好再给，前端不做 HTML 渲染，从根上避免 XSS */
export type CommentSegment =
  { type: "text"; text: string } | { type: "break" } | { type: "link"; text: string; href: string }

export interface GalleryComment {
  /** 上传者留言固定是 0 */
  id: number
  author: string
  /** ISO 8601；页面上的时间解析不出来时是空串 */
  postedAt: string
  isUploader: boolean
  /** 形如 +7，未登录时看不到，此时为空串 */
  score: string
  segments: CommentSegment[]
}

/** 图集的评论：e 站默认只列得分在阈值以上的，其余的只给出条数 */
export interface GalleryComments {
  comments: GalleryComment[]
  /** 得分低于阈值、没有列出的评论条数 */
  hiddenCount: number
}

/** e 站账号的绑定状态 */
export interface CredentialStatus {
  bound: boolean
  /** 未绑定时为空串 */
  memberId: string
  /** 能否访问里站 */
  hasExAccess: boolean
}

/** 标签译名的同步状态 */
export interface TagTranslationStatus {
  /** 从未同步过时为 null */
  lastSync: {
    /** 上游 EhTagTranslation 数据库的提交 sha */
    sha: string
    /** 译名条数，含命名空间本身的译名 */
    count: number
    /** ISO 8601 */
    syncedAt: string
  } | null
}

/** 触底加载的一页。nextCursor 为 null 表示已经是最后一页 */
export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface ReadingHistoryItem {
  gid: number
  token: string
  page: number
  /** ISO 8601 */
  readAt: string
  /** 元数据不可访问时为 null，仍保留记录和删除入口 */
  gallery: GalleryCard | null
}
