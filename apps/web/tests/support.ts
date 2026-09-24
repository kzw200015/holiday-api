import type { GalleryCard } from "@myapi/shared"
import { vi } from "vitest"
import { nextTick } from "vue"

/** 一个由测试决定何时落地的 Promise：用来摆出「请求在途」「旧响应迟到」这类时序。 */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** 真时钟下等已经落地的 Promise 都跑完，再等一轮渲染。 */
export async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

/** 假时钟下的 settle：推进 0 毫秒让排好的回调跑完，再等一轮渲染。 */
export async function settleFakeTimers() {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

/** 列表里的一张卡片，除了 gid 与由它推出的令牌、标题，其余字段固定。 */
export function galleryCard(gid: number): GalleryCard {
  return {
    gid,
    token: `token${gid}`,
    title: `图集 ${gid}`,
    titleJpn: "",
    category: "Manga",
    thumbnail: "/thumbnail",
    uploader: "tester",
    postedAt: "2026-09-05T00:00:00Z",
    fileCount: 10,
    rating: 4,
    tags: [],
  }
}
