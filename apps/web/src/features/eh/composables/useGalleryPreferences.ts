import { DEFAULT_GALLERY_PREFERENCES, type GalleryCategory, type GalleryPreferences } from "@myapi/shared"
import { computed } from "vue"

import { useGalleryPreferencesStore } from "@/features/eh/store"

/**
 * 浏览偏好。
 *
 * 读一次就不再重取：本地这份才是用户正在用的，回头再读只会拿服务端的旧值盖掉他刚改的。
 * 改动先落在本地当场生效，保存随后自己去发；存不上既不回滚也不提示，下次改动会把最新的整份再推一遍。
 */
export function useGalleryPreferences() {
  const store = useGalleryPreferencesStore()
  void store.load()
  /* 读到之前拿默认值占位。页面要等读到才创建，所以它不会被存回去。 */
  const current = computed(() => store.data ?? DEFAULT_GALLERY_PREFERENCES)

  /* 没读到时 store 不改也不存，占位值不会被拼进提交里。 */
  function save(change: Partial<GalleryPreferences>) {
    store.update((preferences) => ({ ...preferences, ...change }))
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
    applyCategories: (next: GalleryCategory[]) => save({ categories: [...next] }),
  }
}
