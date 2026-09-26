import { api, request, requestWithin } from "@/shared/api/httpClient"

/* 带请求体的接口，参数类型取自这次调用本身（Parameters<typeof api.….post>[0]）：接口收什么由后端的路由决定，这里不另写一份 */

/**
 * 搜索图集。cursor 为空表示第一页，翻页时关键词和分类要一起带上。
 *
 * 条件整条放在请求体里：分类是一组名字，塞进查询串就得两头各写一份拼装和拆解的规则。
 * 用 POST 只是为了带这段 JSON，它仍是一次读取——所以照常接 AbortSignal，离开页面要能取消。
 */
export function searchGalleries(search: Parameters<typeof api.eh.galleries.search.post>[0], signal?: AbortSignal) {
  return request(api.eh.galleries.search.post(search, { fetch: { signal } }))
}

/** 图集详情。大图地址逐页另签，见 fetchPageImageUrl；读到第几页另有接口，见 fetchReadingProgress */
export function fetchGalleryDetail(gid: number, token: string, signal?: AbortSignal) {
  return request(api.eh.galleries({ gid })({ token }).get({ fetch: { signal } }))
}

/**
 * 某一页大图的签名地址，直接给 img 的 src 用：img 是浏览器自己发的请求，带不了 Authorization 头，
 * 所以这条地址的身份由后端签在里面，前端不拼、也不改它。签名只在服务端算，不访问 e 站
 */
export function fetchPageImageUrl(gid: number, token: string, page: number, signal?: AbortSignal) {
  return request(api.eh.galleries({ gid })({ token }).pages({ page })["image-url"].get({ fetch: { signal } }))
}

/** 评论单独取，不拖慢详情页首屏 */
export function fetchGalleryComments(gid: number, token: string, signal?: AbortSignal) {
  return request(api.eh.galleries({ gid })({ token }).comments.get({ fetch: { signal } }))
}

/** 详情页第 slice 片（从 0 起）上的预览图。每片多少页由 e 站账号的设置决定，看第 0 片有几页就知道 */
export function fetchGalleryPreviews(gid: number, token: string, slice: number, signal?: AbortSignal) {
  return request(api.eh.galleries({ gid })({ token }).previews({ slice }).get({ fetch: { signal } }))
}

export function fetchCredentialStatus(signal?: AbortSignal) {
  return request(api.eh.credential.get({ fetch: { signal } }))
}

/** 绑定 e 站 Cookie。后端会先拿它实际请求一次，无效就不入库 */
export function bindCredential(cookie: Parameters<typeof api.eh.credential.post>[0]) {
  return request(api.eh.credential.post(cookie))
}

/** 解绑，返回解绑后的状态 */
export function unbindCredential() {
  return request(api.eh.credential.delete())
}

export function fetchTagTranslationStatus(signal?: AbortSignal) {
  return request(api.eh["tag-translations"].get({ fetch: { signal } }))
}

/** 从上游拉一版标签译名替换掉库里的，回同步后的状态。拉取与写入都完成才回，可能要十几秒，所以不设保存的时限 */
export function syncTagTranslations() {
  return request(api.eh["tag-translations"].sync.post())
}

/*
 * 以下写接口一律不接 AbortSignal：已经发出的保存不该因为离开页面被取消，只有挂住太久的才中止（见 SAVE_TIMEOUT）。
 * 都只回成败：本地已经按同一条规则改好了。
 */

/*
 * 保存的时限。保存只是落库，正常百毫秒内就回来；十秒还没回来多半是连接半开（移动网络切换时常见），
 * 再等下去后面排队的保存、等着写入落地才读的数据全都跟着卡住。超时即中止，这一次算没存上。
 * 读取不设这个时限：换页面时由调用方取消，搜索这类要抓上游页面的读取本来就可能很慢。
 */
const SAVE_TIMEOUT = 10_000

export function fetchGalleryPreferences(signal?: AbortSignal) {
  return request(api.eh.preferences.get({ fetch: { signal } }))
}

/** 只改带来的字段。 */
export function patchGalleryPreferences(patch: Parameters<typeof api.eh.preferences.patch>[0]) {
  return requestWithin(SAVE_TIMEOUT, (signal) => api.eh.preferences.patch(patch, { fetch: { signal } }))
}

export function fetchSearchHistory(signal?: AbortSignal) {
  return request(api.eh["search-history"].get({ fetch: { signal } }))
}

/** 记下一个搜过的词，排到最前。超过 200 字节的会被退回。 */
export function addSearchKeyword(keyword: string) {
  return requestWithin(SAVE_TIMEOUT, (signal) => api.eh["search-history"].post({ keyword }, { fetch: { signal } }))
}

/** 要删的词放查询串：它可能是 `..` 这类放进路径会被规范化掉的写法。 */
export function removeSearchKeyword(keyword: string) {
  return requestWithin(SAVE_TIMEOUT, (signal) =>
    api.eh["search-history"].entry.delete(undefined, { query: { keyword }, fetch: { signal } }),
  )
}

export function clearSearchHistory() {
  return requestWithin(SAVE_TIMEOUT, (signal) => api.eh["search-history"].delete(undefined, { fetch: { signal } }))
}

/** 这个账号在这本图集上读到第几页。 */
export function fetchReadingProgress(gid: number, signal?: AbortSignal) {
  return request(api.eh.progress({ gid }).get({ fetch: { signal } }))
}

export function fetchReadingHistory(cursor: string, signal?: AbortSignal) {
  return request(api.eh.history.get({ query: { cursor }, fetch: { signal } }))
}

export function removeReadingHistory(gid: number) {
  return requestWithin(SAVE_TIMEOUT, (signal) => api.eh.history({ gid }).delete(undefined, { fetch: { signal } }))
}

export function clearReadingHistory() {
  return requestWithin(SAVE_TIMEOUT, (signal) => api.eh.history.delete(undefined, { fetch: { signal } }))
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
  const report = { gid, token, page, writer: progressWriter, seq: progressSeq }
  return requestWithin(SAVE_TIMEOUT, (signal) => api.eh.progress.post(report, { fetch: { signal, keepalive: true } }))
}
