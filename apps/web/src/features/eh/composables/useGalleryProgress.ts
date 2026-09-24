import { useQuery } from "@pinia/colada"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchReadingProgress } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"

/**
 * 这个账号在某本图集上读到第几页，从未读过是 null。
 *
 * 阅读器翻页时当场写进这份缓存（见 useReadingProgress），详情页的「继续阅读第 N 页」不必等网络。
 * 读之前先等已经发出的进度保存落地，否则刚退出阅读时读回的还是上报之前的页码。
 */
export function useGalleryProgress(gid: MaybeRefOrGetter<number>) {
  const writes = useEhWrites()
  const query = useQuery(() => {
    const id = toValue(gid)
    return {
      key: ehKeys.progress(id),
      query: async ({ signal }) => {
        await writes.progress.settled()
        return (await fetchReadingProgress(id, signal)).page
      },
    }
  })
  return { progress: computed(() => query.data.value ?? null), reload: () => query.refresh() }
}
