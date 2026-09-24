import type {
  CredentialStatus,
  CursorPage,
  ehCookieSchema,
  GalleryCard,
  GalleryComment,
  GalleryDetailResult,
  galleryPreferencesPatchSchema,
  galleryPreferencesSchema,
  gallerySearchSchema,
  ReadingHistoryItem,
  readingHistoryQuerySchema,
  ReadingProgress,
  readingProgressSchema,
  searchHistoryKeywordSchema,
  TagTranslationStatus,
} from "@myapi/shared/eh"
import type { z } from "zod"

import { httpClient } from "@/shared/api/httpClient"

/**
 * 搜索图集。cursor 为空表示第一页，翻页时关键词和分类要一起带上。
 *
 * 条件整条放在请求体里：分类是一组名字，塞进查询串就得两头各写一份拼装和拆解的规则。
 * 用 POST 只是为了带这段 JSON，它仍是一次读取——所以照常接 AbortSignal，离开页面要能取消。
 */
export function searchGalleries(search: z.input<typeof gallerySearchSchema>, signal?: AbortSignal) {
  return httpClient.post<CursorPage<GalleryCard>>("/eh/galleries/search", search, { signal })
}

/** 图集详情，顺带返回这本图集的大图地址模板。读到第几页另有接口，见 fetchReadingProgress */
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
export function bindCredential(cookie: z.input<typeof ehCookieSchema>) {
  return httpClient.post<CredentialStatus>("/eh/credential", cookie)
}

/** 解绑，返回解绑后的状态 */
export function unbindCredential() {
  return httpClient.delete<CredentialStatus>("/eh/credential")
}

export function fetchTagTranslationStatus(signal?: AbortSignal) {
  return httpClient.get<TagTranslationStatus>("/eh/tag-translations", { signal })
}

/** 从上游拉一版标签译名替换掉库里的，回同步后的状态。拉取与写入都完成才回，可能要十几秒，所以不设保存的时限 */
export function syncTagTranslations() {
  return httpClient.post<TagTranslationStatus>("/eh/tag-translations/sync")
}

/*
 * 以下写接口一律不接 AbortSignal：已经发出的保存不该因为离开页面被取消，只有挂住太久的才中止（见 SAVE_TIMEOUT）。
 * 都只回成败：本地已经按同一条规则改好了。
 */

/*
 * 保存的时限。保存只是落库，正常百毫秒内就回来；十秒还没回来多半是连接半开（移动网络切换时常见），
 * 再等下去同一类后面的保存、等着写入落地才读的数据全都跟着卡住。超时即中止，这一次算没存上。
 * 读取不设这个时限：换页面时由调用方取消，搜索这类要抓上游页面的读取本来就可能很慢。
 */
const SAVE_TIMEOUT = 10_000

export function fetchGalleryPreferences(signal?: AbortSignal) {
  return httpClient.get<z.output<typeof galleryPreferencesSchema>>("/eh/preferences", { signal })
}

/** 只改带来的字段。 */
export function patchGalleryPreferences(patch: z.input<typeof galleryPreferencesPatchSchema>) {
  return httpClient.patch<null>("/eh/preferences", patch, { timeout: SAVE_TIMEOUT })
}

export function fetchSearchHistory(signal?: AbortSignal) {
  return httpClient.get<string[]>("/eh/search-history", { signal })
}

/** 记下一个搜过的词，排到最前。超过 200 字节的会被退回。 */
export function addSearchKeyword(keyword: string) {
  return httpClient.post<null>("/eh/search-history", { keyword } satisfies z.input<typeof searchHistoryKeywordSchema>, {
    timeout: SAVE_TIMEOUT,
  })
}

/** 要删的词放查询串：它可能是 `..` 这类放进路径会被规范化掉的写法。 */
export function removeSearchKeyword(keyword: string) {
  return httpClient.delete<null>("/eh/search-history/entry", {
    params: { keyword } satisfies z.input<typeof searchHistoryKeywordSchema>,
    timeout: SAVE_TIMEOUT,
  })
}

export function clearSearchHistory() {
  return httpClient.delete<null>("/eh/search-history", { timeout: SAVE_TIMEOUT })
}

/** 这个账号在这本图集上读到第几页。 */
export function fetchReadingProgress(gid: number, signal?: AbortSignal) {
  return httpClient.get<ReadingProgress>(`/eh/progress/${gid}`, { signal })
}

export function fetchReadingHistory(cursor: string, signal?: AbortSignal) {
  return httpClient.get<CursorPage<ReadingHistoryItem>>("/eh/history", {
    params: { cursor } satisfies z.input<typeof readingHistoryQuerySchema>,
    signal,
  })
}

export function removeReadingHistory(gid: number) {
  return httpClient.delete<null>(`/eh/history/${gid}`)
}

export function clearReadingHistory() {
  return httpClient.delete<null>("/eh/history")
}

/*
 * 进度上报的上报方与序号。上报不排队，同一本的两次可能乱序到达，服务端按序号只认同一上报方更新的那次，
 * 迟到的旧页码不会把进度按回去。上报方就是这次页面加载，刷新即换一个。
 * 不用 crypto.randomUUID：它只在 HTTPS 和 localhost 下可用。
 */
const progressWriter = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
  byte.toString(16).padStart(2, "0"),
).join("")
let progressSeq = 0

/** 上报读到第几页。带 keepalive：刷新、关标签页时发出的那次，页面卸载之后浏览器照样把它送完。 */
export function saveProgress(gid: number, token: string, page: number) {
  progressSeq += 1
  return httpClient.post<null>(
    "/eh/progress",
    { gid, token, page, writer: progressWriter, seq: progressSeq } satisfies z.input<typeof readingProgressSchema>,
    { timeout: SAVE_TIMEOUT, fetchOptions: { keepalive: true } },
  )
}
