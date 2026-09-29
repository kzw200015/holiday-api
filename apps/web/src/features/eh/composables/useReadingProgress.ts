import { useQuery, useQueryCache, type QueryCache } from "@pinia/colada"
import { useEventListener, useTimeoutFn } from "@vueuse/core"
import { computed, onScopeDispose, toValue, type MaybeRefOrGetter } from "vue"

import { useAuthStore } from "@/features/auth/store"
import { fetchReadingProgress, saveProgress } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"

/*
 * 阅读进度：这个账号在某本图集上读到第几页。读、上报、抹除都在这里，别处不碰进度的缓存。
 *
 * 本地那份是用户正在用的：阅读器翻页、删除阅读历史都当场改它，改之前先取消在途的读取（它带回的是改之前的页码），
 * 读之前先等已经发出的写入落地（见 useEhWrites），读回来的服务端快照才不会把本地刚改的按回去。
 */

/* 翻页是一路连着来的，合并这么久再发一次，不然一本两百页就是两百个请求。 */
const SAVE_DELAY = 1200

/**
 * 读到第几页，从未读过是 null。阅读器翻页时当场写进这份（见 useReadingProgress），详情页的「继续阅读第 N 页」不必等网络。
 */
export function useGalleryProgress(gid: MaybeRefOrGetter<number>) {
  const writes = useEhWrites()
  const query = useQuery(() => {
    const id = toValue(gid)
    return {
      key: ehKeys.progress(id),
      query: writes.after(async ({ signal }: { signal: AbortSignal }) => (await fetchReadingProgress(id, signal)).page),
    }
  })
  return { progress: computed(() => query.data.value ?? null), reload: () => query.refresh() }
}

/**
 * 上报读到第几页。
 *
 * 页码当场写进本地的进度。往服务端存则合并后再发，发时不等前一次回来：乱序到达由服务端按上报序号挡住，
 * 页面卸载时补发的那次也就不会卡在前一次后面发不出去。
 *
 * 一个实例只管一本：阅读器按图集重建，不会中途换。
 */
export function useReadingProgress(gid: number, token: string) {
  const queryCache = useQueryCache()
  const writes = useEhWrites()
  const auth = useAuthStore()
  /* 阅读器属于打开它时的本站账号。令牌失效时先退出、再跳登录页，离开时补发的页码再发出去带的就不是这个账号的令牌了，所以换过账号就一律不发。 */
  const account = auth.pageRevision
  /* 合并窗口里只留最后翻到的那页。 */
  let pending: number | undefined

  /* 窗口从这一轮第一次翻页起算，到点就发，不随后面的翻页往后推：一秒一页的自动翻页比窗口还短，推着推着就一次都发不出去。 */
  const {
    start: scheduleSave,
    stop: cancelSave,
    isPending: saveScheduled,
  } = useTimeoutFn(flush, SAVE_DELAY, { immediate: false })

  /* 把攒着的都发出去。离开阅读页时也要调一次，否则最后翻的几页就丢在合并窗口里了。 */
  function flush() {
    cancelSave()
    if (pending !== undefined && auth.pageRevision === account) {
      /* 存不上不提示也不回退：下次翻页会再报一次。 */
      writes.track(saveProgress(gid, token, pending)).catch(() => {})
    }
    pending = undefined
  }

  /* 刷新、关标签页、移动端切走后被系统回收，都走不到离开路由那一步，页面一收起就先发掉。 */
  useEventListener(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush()
    }
  })
  useEventListener(window, "pagehide", flush)
  /* 离开路由时已经发过一次；这里兜住离开之后、卸载之前又翻过的页。 */
  onScopeDispose(flush)

  return {
    report: (page: number) => {
      setProgress(queryCache, gid, page)
      pending = page
      if (!saveScheduled.value) {
        scheduleSave()
      }
    },
    flush,
  }
}

/**
 * 抹掉本地的进度。删除阅读历史时服务端连同进度一起删了，本地不跟着抹，重进详情就会显示一个服务端已经没有的页码。
 * 只改本地，服务端的那次删除由调用方发出。
 */
export function useForgetProgress() {
  const queryCache = useQueryCache()
  return {
    forget: (gid: number) => setProgress(queryCache, gid, null),
    forgetAll: () => {
      queryCache.cancelQueries({ key: ehKeys.progresses })
      queryCache.setQueriesData({ key: ehKeys.progresses }, () => null)
    },
  }
}

function setProgress(queryCache: QueryCache, gid: number, page: number | null) {
  queryCache.cancelQueries({ key: ehKeys.progress(gid), exact: true })
  queryCache.setQueryData(ehKeys.progress(gid), page)
}
