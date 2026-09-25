import { useQuery } from "@pinia/colada"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchGalleryComments } from "@/features/eh/api"
import { ehKeys } from "@/features/eh/queries"

/** 图集评论。要抓上游页面才拿得到，所以和详情分开取，失败也不影响元数据显示；换绑 e 站账号后可见性跟着变，一并重读。 */
export function useGalleryComments(gid: MaybeRefOrGetter<number>, token: MaybeRefOrGetter<string>) {
  const query = useQuery(() => {
    const id = toValue(gid)
    const galleryToken = toValue(token)
    return {
      key: ehKeys.comments(id, galleryToken),
      query: ({ signal }) => fetchGalleryComments(id, galleryToken, signal),
    }
  })

  return {
    comments: computed(() => query.data.value?.comments),
    /* 得分低于阈值、e 站默认不列出的评论条数 */
    hiddenCount: computed(() => query.data.value?.hiddenCount ?? 0),
    loading: computed(() => query.data.value === undefined && query.error.value === null),
    errorMessage: computed(() => query.error.value?.message ?? ""),
    reload: () => void query.refresh(),
  }
}
