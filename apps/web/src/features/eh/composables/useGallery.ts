import { useQuery } from "@pinia/colada"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchGalleryDetail } from "@/features/eh/api"
import { ehKeys } from "@/features/eh/queries"

/**
 * 一本图集的元数据。详情页和阅读器读的是同一份；读到第几页另有 useReadingProgress，大图地址逐页另签（usePageImageUrl）。
 * 手上有旧的一份时重读失败，旧的照常用，只提示一下。
 */
export function useGallery(gid: MaybeRefOrGetter<number>, token: MaybeRefOrGetter<string>) {
  /* 每本一条缓存，查询函数用的是这一本自己的 gid 与 token。 */
  const query = useQuery(() => {
    const id = toValue(gid)
    const galleryToken = toValue(token)
    return {
      key: ehKeys.gallery(id, galleryToken),
      query: ({ signal }) => fetchGalleryDetail(id, galleryToken, signal),
    }
  })
  const loaded = computed(() => query.data.value !== undefined)
  const failure = computed(() => query.error.value?.message ?? "")

  return {
    gallery: query.data,
    /* 详情是否已经到手。阅读器要等它确定之后才敢上报位置。 */
    loaded,
    loading: computed(() => !loaded.value && query.error.value === null),
    /* 一份都没读到时的失败，页面只能显示错误。 */
    errorMessage: computed(() => (loaded.value ? "" : failure.value)),
    /* 手上有旧的一份、重读却失败了。 */
    refreshError: computed(() => (loaded.value ? failure.value : "")),
    reload: () => void query.refresh(),
  }
}
