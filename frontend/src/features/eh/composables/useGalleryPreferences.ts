import { computed } from "vue"

import type { GalleryPreferences } from "@/features/eh/model"
import { useGalleryPreferencesStore } from "@/features/eh/store"

/* 读到之前的占位，和后端没有偏好行时回的值一致。页面要等读到才创建，所以它不会被存回去。 */
const fallback: GalleryPreferences = { categories: [], readerInterval: 5 }

/**
 * 浏览偏好。
 *
 * 读一次就不再重取：本地这份才是用户正在用的，回头再读只会拿服务端的旧值盖掉他刚改的。
 * 改动先落在本地当场生效，保存随后自己去发；存不上既不回滚也不提示，下次改动会把最新的整份再推一遍。
 */
export function useGalleryPreferences() {
  const store = useGalleryPreferencesStore()
  void store.load()
  const current = computed(() => store.data ?? fallback)

  /* 没读到就不存：保存是整份提交，拿占位值拼出来的那份会把服务端原有的偏好冲掉。
   * 图库页面有布局层挡着，到不了这里；阅读器是直接打开的，偏好读失败时调间隔就会走到。 */
  function save(change: Partial<GalleryPreferences>) {
    if (store.data) {
      store.set({ ...store.data, ...change })
    }
  }

  return {
    /* 真的读到了才算就绪，读失败不算。 */
    ready: computed(() => store.data !== undefined),
    loadError: computed(() => store.error?.message ?? ""),
    reload: () => void store.reload(),
    categories: computed(() => current.value.categories),
    interval: computed({
      get: () => current.value.readerInterval,
      set: (seconds: number) => save({ readerInterval: seconds }),
    }),
    applyCategories: (next: string[]) => save({ categories: [...next] }),
  }
}
