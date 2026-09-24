import type { CredentialStatus, EhCredentialRequest } from "@myapi/shared/eh"
import { computed, ref } from "vue"

import { bindCredential, unbindCredential } from "@/features/eh/api"
import { useCredentialStore, useGalleryContentStore } from "@/features/eh/store"
import { toError } from "@/shared/lib/errors"

/**
 * e 站账号的绑定状态。
 *
 * 设置页和图库布局读的是同一份，所以绑定成功后图库那条「匿名浏览表站」的提示会立刻消失，
 * 不需要谁去通知谁。未读取时 status 为 undefined，界面据此区分「还没问过」和「确实没绑」。
 */
export function useEhCredential() {
  const credential = useCredentialStore()
  const content = useGalleryContentStore()
  void credential.load()

  /* 绑定和解绑一次只会有一个在提交，设置页也只有一处提示，所以共用一份进行中与失败信息。 */
  const saving = ref(false)
  const errorMessage = ref("")

  /*
   * 换绑或解绑都会改变能看到的内容：新状态直接落到本地，受凭据影响的内容一并作废重来。
   * 失败照样抛给调用方，设置页要据此决定显不显示成功提示。
   */
  async function submit(request: () => Promise<CredentialStatus>) {
    saving.value = true
    errorMessage.value = ""
    try {
      const next = await request()
      credential.set(next)
      content.reset()
      return next
    } catch (error) {
      errorMessage.value = toError(error).message
      throw error
    } finally {
      saving.value = false
    }
  }

  return {
    status: computed(() => credential.data),
    loading: computed(() => credential.data === undefined && credential.error === null),
    loadError: computed(() => credential.error?.message ?? ""),
    saving,
    errorMessage,
    reload: () => void credential.reload(),
    bind: (cookie: EhCredentialRequest) => submit(() => bindCredential(cookie)),
    unbind: () => submit(unbindCredential),
  }
}
