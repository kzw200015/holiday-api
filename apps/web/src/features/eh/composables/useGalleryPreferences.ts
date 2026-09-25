import {
  DEFAULT_GALLERY_PREFERENCES,
  GALLERY_CATEGORIES,
  type GalleryCategory,
  type galleryPreferencesPatchSchema,
} from "@myapi/shared/eh"
import { computed } from "vue"
import type { z } from "zod"

import { fetchGalleryPreferences, patchGalleryPreferences } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"
import { useOptimisticData } from "@/shared/api/optimistic"

type PreferencesPatch = z.input<typeof galleryPreferencesPatchSchema>

/** 分类是集合：去重并按固定顺序排好才用，同一组分类的写法只有一种，搜索结果的缓存 key 才对得上。 */
export function normalizeCategories(categories: readonly GalleryCategory[]): GalleryCategory[] {
  return GALLERY_CATEGORIES.filter((category) => categories.includes(category))
}

/**
 * 浏览偏好。
 *
 * 改动当场落进本地那份，保存随后依次发出、只改带来的字段（见 ADR-0006）；存不上就重读一次，以服务端为准。
 * 还没读到时界面也不让改（见 EhLayout 与阅读器）。
 */
export function useGalleryPreferences() {
  const { query, change } = useOptimisticData(ehKeys.preferences, fetchGalleryPreferences, useEhWrites())
  const save = (patch: PreferencesPatch) =>
    change({ apply: (current) => ({ ...current, ...patch }), send: () => patchGalleryPreferences(patch) })
  /* 读到之前拿默认值占位。页面要等读到才创建，用不上它。 */
  const current = computed(() => query.data.value ?? DEFAULT_GALLERY_PREFERENCES)

  return {
    /* 真的读到了才算就绪，读失败不算。 */
    ready: computed(() => query.data.value !== undefined),
    loadError: computed(() => query.error.value?.message ?? ""),
    reload: () => void query.refresh(),
    categories: computed(() => current.value.categories),
    interval: computed({
      get: () => current.value.readerInterval,
      set: (seconds: number) => save({ readerInterval: seconds }),
    }),
    applyCategories: (next: GalleryCategory[]) => save({ categories: normalizeCategories(next) }),
  }
}
