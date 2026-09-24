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
  /** 有里站权限时默认走里站，传 "e" 表示这次只要表站。 */
  site: z.literal("e", { error: "站点不合法" }).optional(),
})

export type GallerySearchRequest = z.input<typeof gallerySearchSchema>

/** 校验并补齐默认值之后的搜索条件，服务端按它干活。 */
export type GallerySearch = z.output<typeof gallerySearchSchema>

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

export type EhCredentialRequest = z.input<typeof ehCookieSchema>

/** 校验并补齐默认值之后的三个 Cookie。 */
export type EhCredential = z.output<typeof ehCookieSchema>

const READER_INTERVAL_RULE = `自动翻页间隔应为 ${READER_INTERVAL_MIN}–${READER_INTERVAL_MAX} 秒`

export const readerIntervalSchema = z
  .int({ error: READER_INTERVAL_RULE })
  .min(READER_INTERVAL_MIN, { error: READER_INTERVAL_RULE })
  .max(READER_INTERVAL_MAX, { error: READER_INTERVAL_RULE })

/** 浏览偏好：读写两个接口的请求体与响应体。 */
export const galleryPreferencesSchema = z.object({
  categories: z.array(categorySchema),
  readerInterval: readerIntervalSchema,
})

export type GalleryPreferences = z.output<typeof galleryPreferencesSchema>

/** 还没存过偏好时的样子，与表上的列默认值一致。 */
export const DEFAULT_GALLERY_PREFERENCES: GalleryPreferences = { categories: [], readerInterval: 5 }

const SEARCH_HISTORY_ENTRY_RULE = `搜索历史关键词应为 1–${KEYWORD_MAX_BYTES} 字节`

/** 搜索历史里的一条。空串存下来没有意义，超长的整份提交会被退回。 */
export const searchHistoryEntrySchema = z
  .string({ error: SEARCH_HISTORY_ENTRY_RULE })
  .min(1, SEARCH_HISTORY_ENTRY_RULE)
  .refine((entry) => utf8Length(entry) <= KEYWORD_MAX_BYTES, SEARCH_HISTORY_ENTRY_RULE)

/** 整份搜索历史。顺序、去重、留哪几条都由前端定，这里只挡存不进去的。 */
export const searchHistorySchema = z.object({
  entries: z
    .array(searchHistoryEntrySchema, { error: `搜索历史最多 ${SEARCH_HISTORY_LIMIT} 条` })
    .max(SEARCH_HISTORY_LIMIT, `搜索历史最多 ${SEARCH_HISTORY_LIMIT} 条`),
})

export type SearchHistory = z.output<typeof searchHistorySchema>

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

export type ReadingProgress = z.output<typeof readingProgressSchema>

/** 阅读历史的查询参数。游标由服务端编出来、前端原样带回，这里只挡明显不像的。 */
export const readingHistoryQuerySchema = z.object({
  cursor: z.string({ error: "阅读历史游标不合法" }).max(256, "阅读历史游标不合法").default(""),
})

/* 只导出输入类型：服务端不直接用这份的输出，而是在它之上把游标解开（见服务端的 history-cursor.ts） */
export type ReadingHistoryQueryRequest = z.input<typeof readingHistoryQuerySchema>

/* ---------- 响应体 ---------- */

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
  /** 形如 artist:gentsuki 的带命名空间标签 */
  tags: string[]
}

/** 详情页比卡片多出来的字段，与卡片的字段平铺在一起 */
export interface GalleryDetail extends GalleryCard {
  /** 字节数 */
  fileSize: number
  torrentCount: number
  /** 图集是否已被删除 */
  expunged: boolean
}

/** 详情接口的整份返回：图集本身，加上这个账号的阅读进度与大图地址模板 */
export interface GalleryDetailResult {
  gallery: GalleryDetail
  /** 从未读过时为 null */
  progress: number | null
  /** 含 {page} 占位符的签名地址，前端只把 {page} 换成页码，不自己解析它 */
  imageUrlTemplate: string
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

/** e 站账号的绑定状态 */
export interface CredentialStatus {
  bound: boolean
  /** 未绑定时为空串 */
  memberId: string
  /** 能否访问里站 */
  hasExAccess: boolean
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
