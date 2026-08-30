import { API_BASE, HttpClient } from "@/api/httpClient"

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
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "link"; text: string; href: string }

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
  // 里站独有，只会出现在详情里，不作为筛选项
  Private: "私有",
}

/** 分类筛选项。value 必须和后端 CATEGORY_NAMES 逐字对应，拼错会被后端回 400 */
export const galleryCategories = CATEGORIES.map(({ value, label }) => ({ value, label }))

/** 搜索图集。cursor 为空表示第一页，翻页时关键词和分类要一起带上 */
export async function searchGalleries(params: { keyword: string; categories: string[]; cursor: string }) {
  const response = await HttpClient.get<GalleryPage>("/eh/galleries", {
    params: { keyword: params.keyword, categories: params.categories.join(","), cursor: params.cursor },
  })
  return response.data
}

/** 图集详情，顺带返回这个账号读到第几页 */
export async function fetchGalleryDetail(gid: number, token: string) {
  const response = await HttpClient.get<{ gallery: GalleryDetail; progress: number | null }>(
    `/eh/galleries/${gid}/${token}`,
  )
  return response.data
}

/** 评论单独取，不拖慢详情页首屏 */
export async function fetchGalleryComments(gid: number, token: string) {
  const response = await HttpClient.get<GalleryComment[]>(`/eh/galleries/${gid}/${token}/comments`)
  return response.data
}

/**
 * 某一页大图的地址，直接给 img 的 src 用。
 * 这里要自己带上前缀：它不走 axios，享受不到 baseURL。
 *
 * nonce 用来绕开浏览器缓存重取（取图失败后重试）。不传时地址里没有查询串，
 * 预取和正式显示才会命中同一份缓存——拼接规则留在这里，页面不该知道这个地址长什么样
 */
export function galleryImageUrl(gid: number, token: string, page: number, options: { nonce?: number } = {}) {
  const url = `${API_BASE}/eh/galleries/${gid}/${token}/pages/${page}/image`
  return options.nonce ? `${url}?r=${options.nonce}` : url
}

export async function fetchCredentialStatus() {
  const response = await HttpClient.get<CredentialStatus>("/eh/credential")
  return response.data
}

/** 绑定 e 站 Cookie。后端会先拿它实际请求一次，无效就不入库 */
export async function bindCredential(cookie: EhCookie) {
  const response = await HttpClient.post<CredentialStatus>("/eh/credential", cookie)
  return response.data
}

export async function unbindCredential() {
  await HttpClient.post<null>("/eh/credential/unbind")
}

/** 上报读到第几页 */
export async function saveProgress(gid: number, token: string, page: number) {
  await HttpClient.post<null>("/eh/progress", { gid, token, page })
}
