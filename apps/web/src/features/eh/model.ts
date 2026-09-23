/* e 站图集领域的数据形状，与后端返回逐字对齐。api 与 store 都从这里取类型，依赖方向只有这一条。 */

/** 列表里一张卡片的内容，与后端 GalleryCard 对齐 */
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

/** 详情页比卡片多出来的字段 */
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
  /** 含 {page} 占位符的签名地址，交给 galleryImageUrl 用，别自己解析它 */
  imageUrlTemplate: string
}

/** 评论正文的片段。后端拆好再给，前端不做 HTML 渲染，从根上避免 XSS */
export type CommentSegment =
  { type: "text"; text: string } | { type: "break" } | { type: "link"; text: string; href: string }

export interface GalleryComment {
  /** 上传者留言固定是 0 */
  id: number
  author: string
  /** ISO 8601 */
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

/** 用户从浏览器复制出来的三个 Cookie */
export interface EhCookie {
  ipbMemberId: string
  ipbPassHash: string
  /** 里站专用，留空则只能看表站 */
  igneous: string
}

export interface GalleryPage {
  items: GalleryCard[]
  /** 为 null 表示已经是最后一页 */
  nextCursor: string | null
}

export interface GallerySearch {
  keyword: string
  categories: string[]
}

export interface GalleryPreferences {
  categories: string[]
  readerInterval: number
}

export interface ReadingHistoryItem {
  gid: number
  token: string
  page: number
  readAt: string
  /** 元数据不可访问时为 null，仍保留记录和删除入口。 */
  gallery: GalleryCard | null
}

export interface ReadingHistoryPage {
  items: ReadingHistoryItem[]
  nextCursor: string | null
}
