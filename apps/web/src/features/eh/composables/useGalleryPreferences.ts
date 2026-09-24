import {
  DEFAULT_GALLERY_PREFERENCES,
  GALLERY_CATEGORIES,
  type GalleryCategory,
  type galleryPreferencesPatchSchema,
  type galleryPreferencesSchema,
} from "@myapi/shared/eh"
import { useMutation, useQuery, useQueryCache } from "@pinia/colada"
import { computed } from "vue"
import type { z } from "zod"

import { fetchGalleryPreferences, patchGalleryPreferences } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"

type Preferences = z.output<typeof galleryPreferencesSchema>
type PreferencesPatch = z.input<typeof galleryPreferencesPatchSchema>

/** 分类是集合：去重并按固定顺序排好才用，同一组分类的写法只有一种，搜索结果的缓存 key 才对得上。 */
export function normalizeCategories(categories: readonly GalleryCategory[]): GalleryCategory[] {
  return GALLERY_CATEGORIES.filter((category) => categories.includes(category))
}

/**
 * 浏览偏好。
 *
 * 改动当场落进本地那份，保存随后依次发出、只改带来的字段（见 ADR-0006）；存不上就重读一次，以服务端为准。
 * 读之前先等已经发出的保存落地，否则读回来的旧值会把刚改的按回去。
 */
export function useGalleryPreferences() {
  const queryCache = useQueryCache()
  const writes = useEhWrites()
  const query = useQuery({
    key: ehKeys.preferences,
    query: async ({ signal }) => {
      await writes.account.settled()
      return fetchGalleryPreferences(signal)
    },
  })
  const save = useMutation({
    /* 还没读到时不改本地：没有那份可改（界面也还不让改，见 EhLayout 与阅读器）。 */
    onMutate: (patch: PreferencesPatch) => {
      const current = queryCache.getQueryData<Preferences>(ehKeys.preferences)
      if (current) {
        queryCache.cancelQueries({ key: ehKeys.preferences, exact: true })
        queryCache.setQueryData<Preferences>(ehKeys.preferences, { ...current, ...patch })
      }
      return { loaded: current !== undefined }
    },
    mutation: (patch: PreferencesPatch) => writes.account.serial(() => patchGalleryPreferences(patch)),
    /* 存不上以服务端为准；没读到时改的，在途那次读取带回的是改之前的样子，同样重读一次。 */
    onSettled: (_result, error, _patch, { loaded }) => {
      if (error || !loaded) {
        void queryCache.invalidateQueries({ key: ehKeys.preferences, exact: true })
      }
    },
  })
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
      set: (seconds: number) => save.mutate({ readerInterval: seconds }),
    }),
    applyCategories: (next: GalleryCategory[]) => save.mutate({ categories: normalizeCategories(next) }),
  }
}
