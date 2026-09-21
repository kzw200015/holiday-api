import { useTimeoutFn } from "@vueuse/core"

import { useGalleryContentStore } from "@/features/eh/store"

/* 翻页是一路连着来的，合并这么久再发一次，不然一本两百页就是两百个请求。 */
const SAVE_DELAY = 1200

/**
 * 上报读到第几页。
 *
 * 页码当场写进这本图集的详情——服务端记的进度本来就是那份数据的一个字段，所以翻页改的和
 * 读回来的是同一处，详情页的「继续阅读第 N 页」不必等网络。往服务端存则合并后再发，
 * 并和其他阅读器排在同一条队上依次执行：同一本的两次上报一旦乱序，后到的旧页码会把进度按回去。
 *
 * 一个实例只管一本：阅读器按图集重建，不会中途换。
 */
export function useReadingProgress(gid: number, token: string) {
  const content = useGalleryContentStore()
  /* 合并窗口里只留最后翻到的那页。 */
  let pending: number | undefined

  const { start: scheduleSave, stop: cancelSave } = useTimeoutFn(flush, SAVE_DELAY, { immediate: false })

  /* 把攒着的都发出去。离开阅读页时也要调一次，否则最后翻的几页就丢在合并窗口里了。 */
  function flush() {
    cancelSave()
    if (pending !== undefined) {
      content.persistProgress(gid, token, pending)
      pending = undefined
    }
  }

  return {
    report: (page: number) => {
      content.setProgress(gid, token, page)
      pending = page
      scheduleSave()
    },
    flush,
  }
}
