import { computed, onActivated, toValue, watch, type MaybeRefOrGetter } from "vue"

import { useGalleryContentStore } from "@/features/eh/store"

/**
 * 一本图集的元数据、大图地址模板与阅读进度。
 *
 * 详情页和阅读器读的是同一份，每次进入都重读一次，手上有的那份在重读期间照常显示。进度也在这份数据里——
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
  /* 详情页被 KeepAlive 留着，回到同一本时参数没变，靠这里重读。首次挂载也会触发，那次已经在读，loadDetail 不会再发。 */
  onActivated(() => void content.loadDetail(toValue(gid), toValue(token)))
  const request = computed(() => content.detail(toValue(gid), toValue(token)))
  const data = computed(() => request.value?.data.value)
  const error = computed(() => request.value?.error.value ?? null)
  /* 详情是否已经到手。阅读器要等它确定之后才敢上报位置。 */
  const loaded = computed(() => data.value !== undefined)
  const failure = computed(() => error.value?.message ?? "")

  return {
    gallery: computed(() => data.value?.gallery),
    imageUrlTemplate: computed(() => data.value?.imageUrlTemplate ?? ""),
    /* 读到第几页。服务端记的和本地刚翻的都落在这份数据上，所以只有这一个出处。 */
    progress: computed(() => data.value?.progress ?? null),
    loaded,
    loading: computed(() => !loaded.value && error.value === null),
    /* 一份都没读到时的失败，页面只能显示错误。 */
    errorMessage: computed(() => (loaded.value ? "" : failure.value)),
    /* 手上有旧的一份、重读却失败了：旧的照常能用（图片地址签的有效期默认有一天），只提示一下。 */
    refreshError: computed(() => (loaded.value ? failure.value : "")),
    reload: () => void content.reloadDetail(toValue(gid), toValue(token)),
  }
}
