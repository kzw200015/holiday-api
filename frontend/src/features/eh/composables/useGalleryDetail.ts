import { useQuery } from "@tanstack/vue-query"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { CONTENT_STALE_TIME, ehKeys } from "@/features/eh/keys"
import { useEhStore } from "@/features/eh/store"

/**
 * 一本图集的元数据、大图地址模板与阅读进度。
 *
 * 详情页和阅读器读的是同一个查询键，所以从详情点进阅读不会再请求一次；进度则活在 Store 里，
 * 因为阅读历史也会刷新它，阅读器每翻一页也要让详情页的「继续阅读第 N 页」跟上。
 */
export function useGalleryDetail(gid: MaybeRefOrGetter<number>, token: MaybeRefOrGetter<string>) {
  const store = useEhStore()
  const detail = useQuery({
    queryKey: computed(() => ehKeys.gallery(toValue(gid), toValue(token))),
    queryFn: ({ signal }) => store.loadGalleryDetail(toValue(gid), toValue(token), signal),
    staleTime: CONTENT_STALE_TIME,
  })

  return {
    gallery: computed(() => detail.data.value?.gallery),
    imageUrlTemplate: computed(() => detail.data.value?.imageUrlTemplate ?? ""),
    progress: computed(() => store.readingProgress.get(toValue(gid)) ?? null),
    /* 详情是否已经到手。阅读器要等它确定之后才敢上报位置。 */
    loaded: computed(() => detail.data.value !== undefined),
    loading: detail.isPending,
    errorMessage: computed(() => detail.error.value?.message ?? ""),
    reload: () => void detail.refetch(),
    /* 上报读到第几页。延时合并与请求顺序由 Store 负责，这里调多少次都不必顾虑。 */
    reportProgress: (page: number) => store.scheduleProgress({ gid: toValue(gid), token: toValue(token), page }),
  }
}
