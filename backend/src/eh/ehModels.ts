import { bigint, boolean, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { z } from "zod"
import { userTable } from "../auth/authModels"
import { timestamps } from "../db/timestamps"

/**
 * 每个用户绑定的 e 站 Cookie。cookie 列存 ehCookieSchema 那三个字段的 JSON 明文，不加密——
 * 注册不开放，库里只有自己人的凭据，为此上一层加解密不划算。
 *
 * 代价要认清：**这一列等同于 e 站账号本身**，拿到就能登进去，密码改了也不影响。
 * 数据库备份、从库、给监控开的只读账号，都要按凭据的标准对待，别随手往外拷。
 *
 * member_id 单独一列是为了设置页显示「已绑定 xxx」时不必解析 JSON。
 *
 * 一个用户只有一条，但主键统一是 id，所以这里 user_id 是唯一索引——它同时是 upsert 的冲突目标。
 */
export const ehCredentialTable = pgTable(
  "eh_credentials",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    cookie: text().notNull(),
    hasExAccess: boolean("has_ex_access").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("eh_credentials_user_id_key").on(table.userId)],
)

/** 阅读进度。(user_id, gid) 上的唯一索引是 upsert 的冲突目标。 */
export const ehReadingProgressTable = pgTable(
  "eh_reading_progress",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    gid: bigint({ mode: "number" }).notNull(),
    token: text().notNull(),
    page: integer().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("eh_reading_progress_user_gid_key").on(table.userId, table.gid)],
)

/** 站点。里站需要有效的 igneous cookie 才进得去。 */
export type EhSite = "e" | "ex"

/**
 * 用户从浏览器里复制出来的三个 e 站 Cookie。
 * 之所以让人手动粘贴而不是代填账号密码：forums.e-hentai.org 的登录接口挂在 Cloudflare 盾后面，
 * 服务端直接 POST 会被 403 challenge 拦掉。
 *
 * 用 schema 而不是裸 interface，是因为解密出来的是一段 JSON 文本，要校验过才敢用。
 */
export const ehCookieSchema = z.object({
  ipbMemberId: z.string().min(1),
  ipbPassHash: z.string().min(1),
  /** 里站专用，没有它就只能看前站，所以允许空串。 */
  igneous: z.string(),
})

export type EhCookie = z.infer<typeof ehCookieSchema>

/** 图集的定位信息，列表页 HTML 里能直接抠出来的就这两样。 */
export interface GalleryRef {
  gid: number
  token: string
}

/**
 * GalleryRef 的 HTTP 入参形态。token 固定 10 位十六进制——这两项会被拼进上游地址，
 * 不校验就等于把用户输入直接发给 e 站。
 *
 * 放在领域类型旁边而不是某个控制器里，是因为两个 eh 控制器都要用它：
 * 图片接口和其余接口分属不同的类，谁 import 谁都别扭。
 */
export const galleryRefSchema = z.object({
  gid: z.coerce.number({ error: "图集编号不合法" }).int().positive({ error: "图集编号不合法" }),
  token: z.string().regex(/^[0-9a-f]{10}$/, { error: "图集令牌不合法" }),
})

/** 取图和上报进度的入参一样：图集定位加一个页码。 */
export const galleryPageSchema = galleryRefSchema.extend({
  page: z.coerce.number({ error: "页码不合法" }).int().positive({ error: "页码不合法" }),
})

/** 列表里一张卡片要展示的内容，字段顺序即 JSON 序列化顺序。 */
export interface GalleryCard {
  gid: number
  token: string
  title: string
  titleJpn: string
  category: string
  /** 已经换成本站的代理地址，不是 ehgt.org 的原始地址。 */
  thumbnail: string
  uploader: string
  /** ISO 8601，前端自己按本地时区格式化。 */
  postedAt: string
  fileCount: number
  rating: number
  /** 形如 `artist:gentsuki` 的带命名空间标签。 */
  tags: string[]
}

/** 详情页在卡片基础上多出来的字段。 */
export interface GalleryDetail extends GalleryCard {
  fileSize: number
  torrentCount: number
  expunged: boolean
}

/**
 * 评论正文切成片段而不是直接给 HTML：正文是第三方站点的用户产出内容，
 * 直接交给前端 v-html 就是把 XSS 请进门。切成片段后前端用普通 JSX 渲染，链接还能保持可点。
 */
export type CommentSegment =
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "link"; text: string; href: string }

export interface GalleryComment {
  /** e 站的评论 id，上传者留言固定是 0。 */
  id: number
  author: string
  /** ISO 8601。e 站页面上写的是 UTC。 */
  postedAt: string
  isUploader: boolean
  /** 形如 `+7`，未登录时页面上就没有这一项，此时为空串。 */
  score: string
  segments: CommentSegment[]
}

/** 单个图集的元数据。字段名是 e 站 API 的原样，转换成领域类型在 service 里做。 */
const gdataEntrySchema = z.object({
  gid: z.coerce.number(),
  token: z.string(),
  title: z.string(),
  title_jpn: z.string(),
  category: z.string(),
  thumb: z.string(),
  uploader: z.string(),
  // 这几项 e 站返回的是字符串（"329"、"4.68"），必须 coerce，写成 z.number() 会全线报错
  posted: z.coerce.number(),
  filecount: z.coerce.number(),
  filesize: z.coerce.number(),
  expunged: z.boolean(),
  rating: z.coerce.number(),
  torrentcount: z.coerce.number(),
  tags: z.array(z.string()),
})

export type GdataEntry = z.infer<typeof gdataEntrySchema>

/**
 * gdata 的响应。单个图集被删或转私有时，那一条会变成 `{ gid, error }`，
 * 所以用 union 兜住，让整批不至于因为一条坏数据全废。
 */
export const gdataResponseSchema = z.object({
  gmetadata: z.array(z.union([gdataEntrySchema, z.object({ error: z.string() })])),
})

/**
 * showpage 的响应。成功时 i3 里是 `<img id="img" src=...>` 加上指向下一页的链接，
 * showkey 过期时则是 `{"error":"Key mismatch"}`。
 */
export const showPageResponseSchema = z.union([
  z.object({ i3: z.string(), x: z.coerce.number(), y: z.coerce.number() }),
  z.object({ error: z.string() }),
])
