import type { CursorPage } from "@myapi/shared"
import { computed, onScopeDispose, ref } from "vue"

import { createRequest } from "@/shared/api/request"

/**
 * 按游标往后触底加载的一串页，数据只活在当前组件里。
 *
 * 只往后翻，不做上一页下一页：游标分页本来只给「下一页从哪开始」，往回翻就得自己记住每页的起点。
 * 同一时刻只有一个请求在途：restart 与 refetch 会取消它重来，fetchNext 等它跑完才动。组件销毁时取消在途的那次。
 */
export function useCursorPages<T>(fetchPage: (cursor: string, signal: AbortSignal) => Promise<CursorPage<T>>) {
  const request = createRequest<CursorPage<T>[]>()
  /* 最近发起的那次是不是续取；只在有请求在途时才看它。区分出来是为了让刷新不在列表底部冒出续取的骨架屏。 */
  const fetchingNext = ref(false)

  function lastPage() {
    return request.data.value?.at(-1)
  }

  /** 丢掉已有的页，从第一页重来。 */
  function restart() {
    request.clear()
    fetchingNext.value = false
    void request.run(async (signal) => [await fetchPage("", signal)])
  }

  /** 接着最后一页往下取；一页都没有时取第一页，所以第一页失败后的重试也走这里。 */
  function fetchNext() {
    const last = lastPage()
    const cursor = last ? last.nextCursor : ""
    if (request.pending.value || cursor === null) {
      return
    }
    fetchingNext.value = true
    void request.run(async (signal) => {
      const page = await fetchPage(cursor, signal)
      /* 接到回来那一刻的列表上，而不是发出时的那份：中间被 update 改过的内容不会被旧快照带回来。 */
      return [...(request.data.value ?? []), page]
    })
  }

  /** 按已加载的页数从头重读一遍，读完整份替换。内容刷新了，翻到的深度不变，滚动位置也就还对得上。 */
  async function refetch() {
    const count = Math.max(1, request.data.value?.length ?? 0)
    fetchingNext.value = false
    await request.run(async (signal) => {
      const pages: CursorPage<T>[] = []
      let cursor: string | null = ""
      while (cursor !== null && pages.length < count) {
        /* oxlint-disable-next-line no-await-in-loop -- 下一页的游标要等上一页回来才知道，只能逐页读。 */
        const page: CursorPage<T> = await fetchPage(cursor, signal)
        pages.push(page)
        cursor = page.nextCursor
      }
      return pages
    })
  }

  /** 直接改本地的页，用于删除这类不必重新拉取的改动。 */
  function update(change: (pages: CursorPage<T>[]) => CursorPage<T>[]) {
    if (request.data.value) {
      request.data.value = change(request.data.value)
    }
  }

  onScopeDispose(request.abort)

  return {
    items: computed(() => request.data.value?.flatMap((page) => page.items) ?? []),
    /** 有请求在途，不论是第一页、续取还是刷新。 */
    pending: request.pending,
    error: request.error,
    /** 还没有任何一页、也没失败。 */
    loading: computed(() => request.data.value === undefined && request.error.value === null),
    /** 正在续取下一页。 */
    loadingMore: computed(() => request.pending.value && fetchingNext.value),
    hasMore: computed(() => {
      const last = lastPage()
      return last !== undefined && last.nextCursor !== null
    }),
    restart,
    fetchNext,
    refetch,
    update,
  }
}
