import { useQuery } from "@tanstack/vue-query"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchGalleryComments } from "@/features/eh/api"
import { CONTENT_STALE_TIME, ehKeys } from "@/features/eh/keys"

/** 图集评论。要抓上游页面才拿得到，所以和详情分开取，失败也不影响元数据显示。 */
export function useGalleryComments(gid: MaybeRefOrGetter<number>, token: MaybeRefOrGetter<string>) {
  const comments = useQuery({
    queryKey: computed(() => ehKeys.comments(toValue(gid), toValue(token))),
    queryFn: ({ signal }) => fetchGalleryComments(toValue(gid), toValue(token), signal),
    staleTime: CONTENT_STALE_TIME,
  })

  return {
    comments: comments.data,
    loading: comments.isPending,
    errorMessage: computed(() => comments.error.value?.message ?? ""),
    reload: () => void comments.refetch(),
  }
}
