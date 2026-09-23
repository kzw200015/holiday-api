import { toValue, type MaybeRefOrGetter } from "vue"

import { fetchGalleryComments } from "@/features/eh/api"
import { useGalleryContentStore } from "@/features/eh/store"
import { useRequest } from "@/shared/composables/useRequest"

/** 图集评论。要抓上游页面才拿得到，所以和详情分开取，失败也不影响元数据显示。 */
export function useGalleryComments(gid: MaybeRefOrGetter<number>, token: MaybeRefOrGetter<string>) {
  const content = useGalleryContentStore()
  /* 换绑 e 站账号后评论的可见性也跟着变，所以内容版本号也算一个参数。 */
  const { data, loading, errorMessage, reload } = useRequest(
    [() => toValue(gid), () => toValue(token), () => content.revision],
    (signal) => fetchGalleryComments(toValue(gid), toValue(token), signal),
  )

  return { comments: data, loading, errorMessage, reload }
}
