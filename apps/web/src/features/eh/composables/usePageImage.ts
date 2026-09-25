import { useQuery } from "@pinia/colada"
import { computed, ref } from "vue"

import { fetchPageImageUrl } from "@/features/eh/api"
import { ehKeys } from "@/features/eh/queries"

/**
 * 阅读器里某一页大图：签地址、取图失败与重试。
 *
 * 每页挂载时现签一份地址，不依赖详情什么时候下发，也就不会拿着过期的地址去取图；签名里带着页码，每页各用各的。
 * 页面卸载后地址不留在缓存里（gcTime 为 0）：下次挂载时它可能已经过期了。一个实例只管一页，参数当常量用。
 */
export function usePageImage(gid: number, token: string, page: number) {
  const query = useQuery({
    key: ehKeys.pageImage(gid, token, page),
    query: ({ signal }) => fetchPageImageUrl(gid, token, page, signal),
    gcTime: 0,
  })
  /* 地址签到了，图却没取到。 */
  const broken = ref(false)
  /*
   * 第几次重试，拼进地址：同一个签发窗口里重签回来的地址和原来一模一样，不换一下浏览器不会重新去取。
   * 没重试过时地址原样，预取与显示才会命中同一份缓存。
   */
  const attempt = ref(0)
  const loading = computed(() => query.asyncStatus.value === "loading")

  return {
    /* 给 img 的 src 用；还没签到时为 undefined */
    src: computed(() => {
      const url = query.data.value?.url
      return url && attempt.value ? `${url}&r=${attempt.value}` : url
    }),
    loading,
    /* 地址没签到，或图没取到 */
    failed: computed(() => broken.value || query.error.value !== null),
    /* 图没取到时由 img 的 error 事件调用 */
    fail: () => {
      broken.value = true
    },
    /* 地址没签到就重签；图没取到也先重签一次（这页可能挂得太久、地址过期了），再换个地址重取。不会 reject。 */
    retry: async () => {
      if (loading.value) {
        return
      }
      await query.refresh()
      if (broken.value && query.error.value === null) {
        broken.value = false
        attempt.value += 1
      }
    },
  }
}
