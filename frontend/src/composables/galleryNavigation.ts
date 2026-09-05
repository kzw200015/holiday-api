import { inject, type InjectionKey } from "vue"

export interface ReaderPosition {
  gid: number
  token: string
  page: number
}

/* 只传递离开阅读器的通知；详情数据与进度仍由被缓存的详情组件持有。 */
export function createGalleryNavigation() {
  const listeners = new Set<(position: ReaderPosition) => void>()
  return {
    subscribe(listener: (position: ReaderPosition) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish(position: ReaderPosition) {
      listeners.forEach((listener) => listener(position))
    },
  }
}

export const galleryNavigationKey: InjectionKey<ReturnType<typeof createGalleryNavigation>> = Symbol("galleryNavigation")
export const useGalleryNavigation = () => inject(galleryNavigationKey)!
