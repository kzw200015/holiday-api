import { DEFAULT_GALLERY_PREFERENCES, GALLERY_CATEGORIES } from "@myapi/shared/eh"
import { computed } from "vue"

import { fetchGalleryPreferences, patchGalleryPreferences } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"
import { useOptimisticData } from "@/shared/api/optimistic"
import type { GalleryPreferences } from "@server/eh/preferences.service"

type PreferencesPatch = Parameters<typeof patchGalleryPreferences>[0]

/** 筛选条件：搜索时关键词以外的条件，存在偏好里，在同一个面板里一起改、一起应用。 */
export type GalleryFilters = Pick<GalleryPreferences, "categories" | "minRating">

/** 分类是集合：去重并按固定顺序排好才用，同一组筛选条件的写法只有一种，搜索结果的缓存 key 才对得上。 */
export function normalizeFilters({ categories, minRating }: GalleryFilters): GalleryFilters {
  return { categories: GALLERY_CATEGORIES.filter((category) => categories.includes(category)), minRating }
}

/** 生效的筛选条件有几项：分类全不选、全选都是不限，不算。 */
export function activeFilterCount({ categories, minRating }: GalleryFilters): number {
  const selected = new Set(categories).size
  return Number(selected > 0 && selected < GALLERY_CATEGORIES.length) + Number(minRating !== null)
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
    filters: computed<GalleryFilters>(() => ({
      categories: current.value.categories,
      minRating: current.value.minRating,
    })),
    interval: computed({
      get: () => current.value.readerInterval,
      set: (seconds: number) => save({ readerInterval: seconds }),
    }),
    /* 面板里的几项一起提交：它们只在这一处改，不会和别处的改动互相覆盖。 */
    applyFilters: (next: GalleryFilters) => save(normalizeFilters(next)),
  }
}
