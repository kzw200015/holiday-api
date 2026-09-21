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

/**
 * 搜索图集。cursor 为空表示第一页，翻页时关键词和分类要一起带上。
 *
 * 条件整条放在请求体里：分类是一组名字，塞进查询串就得两头各写一份拼装和拆解的规则。
 * 用 POST 只是为了带这段 JSON，它仍是一次读取——所以照常接 AbortSignal，离开页面要能取消。
 */
export function searchGalleries(params: GallerySearch & { cursor: string }, signal?: AbortSignal) {
  return httpClient.post<GalleryPage>(
    "/eh/galleries/search",
    { keyword: params.keyword, categories: params.categories, cursor: params.cursor },
    { signal },
  )
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
  return httpClient.delete<CredentialStatus>("/eh/credential")
}

/* 偏好与搜索历史读一次之后由前端说了算，写入都是把当前这份整个推上去，不再逐个动作上报。
 * 以下写接口一律不接 AbortSignal：已经发出的保存不该被取消。 */

export function fetchGalleryPreferences(signal?: AbortSignal) {
  return httpClient.get<GalleryPreferences>("/eh/preferences", { signal })
}

/** 只回成败：本地那份才是用户正在用的，服务端存成什么样不回写。 */
export function saveGalleryPreferences(preferences: GalleryPreferences) {
  return httpClient.put<null>("/eh/preferences", preferences)
}

export function fetchSearchHistory(signal?: AbortSignal) {
  return httpClient.get<string[]>("/eh/search-history", { signal })
}

/** 同样只回成败。超过 10 条或含超过 200 字节的关键词会被整份退回。 */
export function saveSearchHistory(entries: string[]) {
  return httpClient.put<null>("/eh/search-history", { entries })
}

export function fetchReadingHistory(cursor: string, signal?: AbortSignal) {
  return httpClient.get<ReadingHistoryPage>("/eh/history", { params: { cursor }, signal })
}

export function removeReadingHistory(gid: number) {
  return httpClient.delete<null>(`/eh/history/${gid}`)
}

export function clearReadingHistory() {
  return httpClient.delete<null>("/eh/history")
}

/** 上报读到第几页 */
export function saveProgress(gid: number, token: string, page: number) {
  return httpClient.post<null>("/eh/progress", { gid, token, page })
}
