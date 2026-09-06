import { createEventHook } from "@vueuse/core"
import { inject, type InjectionKey } from "vue"

export interface ReaderPosition {
  gid: number
  token: string
  page: number
}

/* 只传递离开阅读器的通知；详情数据与进度仍由被缓存的详情组件持有。监听随组件作用域自动解除。 */
export function createGalleryNavigation() {
  return createEventHook<ReaderPosition>()
}

export const galleryNavigationKey: InjectionKey<ReturnType<typeof createGalleryNavigation>> =
  Symbol("galleryNavigation")
export function useGalleryNavigation() {
  return inject(galleryNavigationKey)!
}
