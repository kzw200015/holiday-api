import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed } from "vue"

import {
  bindCredential,
  ehKeys,
  fetchCredentialStatus,
  unbindCredential,
  type CredentialStatus,
  type EhCookie,
} from "@/api/eh"

/**
 * e 站账号的绑定状态。
 *
 * 设置页和图库布局读的是同一个查询键，所以绑定成功后图库那条「匿名浏览前站」的提示会立刻消失，
 * 不需要谁去通知谁。未读取时 status 为 undefined，界面据此区分「还没问过」和「确实没绑」。
 */
export function useEhCredential() {
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ehKeys.credential,
    queryFn: ({ signal }) => fetchCredentialStatus(signal),
  })

  /* 换绑或解绑都会改变能看到的内容：新状态直接落到缓存，受凭据影响的内容一并作废。 */
  function accept(next: CredentialStatus) {
    queryClient.setQueryData(ehKeys.credential, next)
    void queryClient.invalidateQueries({ queryKey: ehKeys.content })
  }

  const binding = useMutation({ mutationFn: (cookie: EhCookie) => bindCredential(cookie), onSuccess: accept })
  const unbinding = useMutation({ mutationFn: () => unbindCredential(), onSuccess: accept })

  return {
    status: status.data,
    loading: status.isPending,
    loadError: computed(() => status.error.value?.message ?? ""),
    saving: computed(() => binding.isPending.value || unbinding.isPending.value),
    errorMessage: computed(() => (binding.error.value ?? unbinding.error.value)?.message ?? ""),
    reload: () => void status.refetch(),
    bind: (cookie: EhCookie) => binding.mutateAsync(cookie),
    unbind: () => unbinding.mutateAsync(),
  }
}
