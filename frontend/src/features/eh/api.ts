import type {
  CredentialStatus,
  EhCookie,
  GalleryComment,
  GalleryDetailResult,
  GalleryPage,
  GalleryPreferences,
  GallerySearch,
  ReadingHistoryPage,
} from "@/features/eh/model"
import { httpClient } from "@/shared/api/httpClient"

/** 搜索图集。cursor 为空表示第一页，翻页时关键词和分类要一起带上 */
export function searchGalleries(params: GallerySearch & { cursor: string }, signal?: AbortSignal) {
  return httpClient.get<GalleryPage>("/eh/galleries", {
    params: { keyword: params.keyword, categories: params.categories.join(","), cursor: params.cursor },
    signal,
  })
}

/** 图集详情，顺带返回这个账号读到第几页，以及这本图集的大图地址模板 */
export function fetchGalleryDetail(gid: number, token: string, signal?: AbortSignal) {
  return httpClient.get<GalleryDetailResult>(`/eh/galleries/${gid}/${token}`, { signal })
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
