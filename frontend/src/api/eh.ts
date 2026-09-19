import { httpClient } from "@/api/httpClient"

/**
 * 查询键。第二段把数据分成两类：content 是受 e 站凭据影响的内容，换绑 e 站账号后要重取；
 * account 是本站的账号数据（浏览偏好、绑定状态本身），不该跟着 e 站账号一起失效。
 */
export const ehKeys = {
  content: ["eh", "content"] as const,
  gallery: (gid: number, token: string) => ["eh", "content", "gallery", gid, token] as const,
  comments: (gid: number, token: string) => ["eh", "content", "comments", gid, token] as const,
  /* 历史记录本身是本站数据，但每条都带着 e 站的图集元数据，可见性跟着凭据变，所以同属 content。 */
  history: ["eh", "content", "history"] as const,
  /* 分类数组参与哈希，顺序不同就是另一份查询，所以提交前一律去重排序。 */
  galleries: (search: GallerySearch) => ["eh", "content", "galleries", search] as const,
  preferences: ["eh", "account", "preferences"] as const,
  searchHistory: ["eh", "account", "searchHistory"] as const,
  credential: ["eh", "account", "credential"] as const,
}

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
  /** 里站专用，留空则只能看前站 */
  igneous: string
}

export interface GalleryPage {
  items: GalleryCard[]
  /** 为 null 表示已经是最后一页 */
  nextCursor: string | null
}

/**
 * 分类的三种叫法：value 是后端筛选参数认的名字，name 是 gdata 返回的展示名，label 是界面文案。
 * 合成一张表是因为中文标签本来两处都要用，分开写就会出现「卡片上写『漫画』、筛选按钮上写别的」。
 */
const CATEGORIES = [
  { value: "doujinshi", name: "Doujinshi", label: "同人志" },
  { value: "manga", name: "Manga", label: "漫画" },
  { value: "artistcg", name: "Artist CG", label: "画师 CG" },
  { value: "gamecg", name: "Game CG", label: "游戏 CG" },
  { value: "western", name: "Western", label: "西方" },
  { value: "non-h", name: "Non-H", label: "非 H" },
  { value: "imageset", name: "Image Set", label: "图集" },
  { value: "cosplay", name: "Cosplay", label: "Cosplay" },
  { value: "asianporn", name: "Asian Porn", label: "亚洲写真" },
  { value: "misc", name: "Misc", label: "杂项" },
] as const

/** e 站返回的分类名到中文的映射。没收录的分类原样显示 */
export const categoryLabels: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES.map(({ name, label }) => [name, label])),
  /* 里站独有，只会出现在详情里，不作为筛选项 */
  Private: "私有",
}

/** 分类筛选项。value 必须和后端 CATEGORY_NAMES 逐字对应，拼错会被后端回 400 */
export const galleryCategories = CATEGORIES.map(({ value, label }) => ({ value, label }))

export interface GallerySearch {
  keyword: string
  categories: string[]
}

/** 搜索图集。cursor 为空表示第一页，翻页时关键词和分类要一起带上 */
export function searchGalleries(params: GallerySearch & { cursor: string }, signal?: AbortSignal) {
  return httpClient.get<GalleryPage>("/eh/galleries", {
    params: { keyword: params.keyword, categories: params.categories.join(","), cursor: params.cursor },
    signal,
  })
}

/** 图集详情，顺带返回这个账号读到第几页，以及这本图集的大图地址模板 */
export function fetchGalleryDetail(gid: number, token: string, signal?: AbortSignal) {
  return httpClient.get<{
    gallery: GalleryDetail
    progress: number | null
    /** 含 {page} 占位符的签名地址，交给 galleryImageUrl 用，别自己解析它 */
    imageUrlTemplate: string
  }>(`/eh/galleries/${gid}/${token}`, { signal })
}

/** 评论单独取，不拖慢详情页首屏 */
export function fetchGalleryComments(gid: number, token: string, signal?: AbortSignal) {
  return httpClient.get<GalleryComment[]>(`/eh/galleries/${gid}/${token}/comments`, { signal })
}

/**
 * 某一页大图的地址，直接给 img 的 src 用。
 *
 * template 来自 fetchGalleryDetail：img 是浏览器自己发的请求，带不了 Authorization 头，
 * 所以这条地址的身份由后端签在里面，前端只负责把 {page} 换成页码，不拼、也不改其它部分。
 * 模板本身已经是可直接请求的完整路径，不需要再拼前缀。
 *
 * nonce 用来绕开浏览器缓存重取（取图失败后重试）。不传时地址和预取时完全一致，
 * 两者才会命中同一份缓存
 */
export function galleryImageUrl(template: string, page: number, options: { nonce?: number } = {}) {
  const url = template.replace("{page}", String(page))
  return options.nonce ? `${url}&r=${options.nonce}` : url
}

export function fetchCredentialStatus(signal?: AbortSignal) {
  return httpClient.get<CredentialStatus>("/eh/credential", { signal })
}

/** 绑定 e 站 Cookie。后端会先拿它实际请求一次，无效就不入库 */
export function bindCredential(cookie: EhCookie) {
  return httpClient.post<CredentialStatus>("/eh/credential", cookie)
}

/** 解绑，返回解绑后的状态 */
export function unbindCredential() {
  return httpClient.post<CredentialStatus>("/eh/credential/unbind")
}

export interface GalleryPreferences {
  categories: string[]
  readerInterval: number
}

export function fetchGalleryPreferences(signal?: AbortSignal) {
  return httpClient.get<GalleryPreferences>("/eh/preferences", { signal })
}

export function saveGalleryCategories(categories: string[], signal?: AbortSignal) {
  return httpClient.post<null>("/eh/preferences/categories", { categories }, { signal })
}

export function saveReaderInterval(interval: number, signal?: AbortSignal) {
  return httpClient.post<null>("/eh/preferences/reader-interval", { interval }, { signal })
}

export function fetchSearchHistory(signal?: AbortSignal) {
  return httpClient.get<string[]>("/eh/search-history", { signal })
}

export function recordSearch(keyword: string, signal?: AbortSignal) {
  return httpClient.post<string[]>("/eh/search-history", { keyword }, { signal })
}

export function removeSearch(keyword: string, signal?: AbortSignal) {
  return httpClient.post<string[]>("/eh/search-history/remove", { keyword }, { signal })
}

/** 清空，返回清空后的历史（空列表），与记录、删除保持同一种返回 */
export function clearSearchHistory(signal?: AbortSignal) {
  return httpClient.post<string[]>("/eh/search-history/clear", undefined, { signal })
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

export function fetchReadingHistory(cursor: string, signal?: AbortSignal) {
  return httpClient.get<ReadingHistoryPage>("/eh/history", { params: { cursor }, signal })
}

export function removeReadingHistory(gid: number, signal?: AbortSignal) {
  return httpClient.post<null>("/eh/history/remove", { gid }, { signal })
}

export function clearReadingHistory(signal?: AbortSignal) {
  return httpClient.post<null>("/eh/history/clear", undefined, { signal })
}

/** 上报读到第几页 */
export function saveProgress(gid: number, token: string, page: number, signal?: AbortSignal) {
  return httpClient.post<null>("/eh/progress", { gid, token, page }, { signal })
}
