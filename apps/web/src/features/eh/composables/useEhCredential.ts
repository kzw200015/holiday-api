import { useMutation, useQuery, useQueryCache } from "@pinia/colada"
import { computed } from "vue"

import { bindCredential, fetchCredentialStatus, unbindCredential } from "@/features/eh/api"
import { ehKeys, invalidateEhContent } from "@/features/eh/queries"
import type { CredentialStatus } from "@server/eh/credential.service"

/**
 * e 站账号的绑定状态，以及绑定与解绑。
 *
 * 设置页和图库布局读的是同一份，所以绑定成功后图库那条「匿名浏览表站」的提示会立刻消失，
 * 不需要谁去通知谁。未读到时 status 为 undefined，界面据此区分「还没问过」和「确实没绑」。
 */
export function useEhCredential() {
  const queryCache = useQueryCache()
  const query = useQuery({ key: ehKeys.credential, query: ({ signal }) => fetchCredentialStatus(signal) })

  /* 绑定和解绑一次只会有一个在提交，设置页也只有一处提示，所以共用一个 mutation。 */
  const change = useMutation({
    /* 在途的读取带回来的是换绑之前的状态，不能让它落在新状态后面。 */
    onMutate: () => queryCache.cancelQueries({ key: ehKeys.credential, exact: true }),
    mutation: (request: () => Promise<CredentialStatus>) => request(),
    /* 新状态直接用接口回的；能看到的内容变了，受凭据影响的一并作废重读。 */
    onSuccess: (next) => {
      queryCache.setQueryData(ehKeys.credential, next)
      void invalidateEhContent(queryCache)
    },
  })

  return {
    status: query.data,
    loading: computed(() => query.data.value === undefined && query.error.value === null),
    loadError: computed(() => query.error.value?.message ?? ""),
    saving: change.isLoading,
    errorMessage: computed(() => change.error.value?.message ?? ""),
    /* 不会 reject，失败落在 loadError 上 */
    reload: () => query.refresh(),
    /* 失败照样抛给调用方，设置页要据此决定显不显示成功提示。 */
    bind: (cookie: Parameters<typeof bindCredential>[0]) => change.mutateAsync(() => bindCredential(cookie)),
    unbind: () => change.mutateAsync(unbindCredential),
  }
}
