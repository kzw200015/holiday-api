import { computed, toValue, watch, type MaybeRefOrGetter } from "vue"

import { useGalleryContentStore } from "@/features/eh/store"

/**
 * 一本图集的元数据、大图地址模板与阅读进度。
 *
 * 详情页和阅读器读的是同一份，所以从详情点进阅读不会再请求一次。进度也在这份数据里——
 * 它本来就是详情接口返回的字段，翻页时由 useReadingProgress 改这同一份，不另存一处。
 */
export function useGalleryDetail(gid: MaybeRefOrGetter<number>, token: MaybeRefOrGetter<string>) {
  const content = useGalleryContentStore()
  /* 换图集要读另一本；换绑 e 站账号后详情整份作废，版本号一变就重读当前这本。 */
  watch(
    [() => toValue(gid), () => toValue(token), () => content.revision],
    ([nextGid, nextToken]) => void content.loadDetail(nextGid, nextToken),
    { immediate: true },
  )
  const request = computed(() => content.detail(toValue(gid), toValue(token)))
  const data = computed(() => request.value?.data.value)
  const error = computed(() => request.value?.error.value ?? null)

  return {
    gallery: computed(() => data.value?.gallery),
    imageUrlTemplate: computed(() => data.value?.imageUrlTemplate ?? ""),
    /* 读到第几页。服务端记的和本地刚翻的都落在这份数据上，所以只有这一个出处。 */
    progress: computed(() => data.value?.progress ?? null),
    /* 详情是否已经到手。阅读器要等它确定之后才敢上报位置。 */
    loaded: computed(() => data.value !== undefined),
    loading: computed(() => data.value === undefined && error.value === null),
    errorMessage: computed(() => error.value?.message ?? ""),
    reload: () => void content.reloadDetail(toValue(gid), toValue(token)),
  }
}
