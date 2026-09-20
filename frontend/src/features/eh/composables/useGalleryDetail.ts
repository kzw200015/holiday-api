import { useQuery } from "@tanstack/vue-query"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchGalleryDetail } from "@/features/eh/api"
import { CONTENT_STALE_TIME, ehKeys } from "@/features/eh/keys"

/**
 * 一本图集的元数据、大图地址模板与阅读进度。
 *
 * 详情页和阅读器读的是同一个查询键，所以从详情点进阅读不会再请求一次。进度也在这份数据里——
 * 它本来就是详情接口返回的字段，翻页时由 useReadingProgress 改这同一份缓存，不另存一处。
 */
export function useGalleryDetail(gid: MaybeRefOrGetter<number>, token: MaybeRefOrGetter<string>) {
  const detail = useQuery({
    queryKey: computed(() => ehKeys.gallery(toValue(gid), toValue(token))),
    queryFn: ({ signal }) => fetchGalleryDetail(toValue(gid), toValue(token), signal),
    staleTime: CONTENT_STALE_TIME,
  })

  return {
    gallery: computed(() => detail.data.value?.gallery),
    imageUrlTemplate: computed(() => detail.data.value?.imageUrlTemplate ?? ""),
    /* 读到第几页。服务端记的和本地刚翻的都落在这份缓存上，所以只有这一个出处。 */
    progress: computed(() => detail.data.value?.progress ?? null),
    /* 详情是否已经到手。阅读器要等它确定之后才敢上报位置。 */
    loaded: computed(() => detail.data.value !== undefined),
    loading: detail.isPending,
    errorMessage: computed(() => detail.error.value?.message ?? ""),
    reload: () => void detail.refetch(),
  }
}
