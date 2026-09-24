import { ref } from "vue"

import { fetchTagTranslationStatus, syncTagTranslations } from "@/features/eh/api"
import { useRequest } from "@/shared/composables/useRequest"
import { toError } from "@/shared/lib/errors"

/**
 * 标签译名的同步状态与手动同步，只在设置页用。
 *
 * 同步成功后直接用接口回的新状态，不再读一次。被 KeepAlive 留着的搜索结果要等下次搜索才换成新译名
 * （图集详情每次进入都会重读）：为几个标签的说法把它们全作废重来不值得。
 */
export function useTagTranslations() {
  const { data, loading, errorMessage: loadError, reload } = useRequest([], fetchTagTranslationStatus)
  const syncing = ref(false)
  const errorMessage = ref("")

  async function sync() {
    syncing.value = true
    errorMessage.value = ""
    try {
      data.value = await syncTagTranslations()
    } catch (error) {
      errorMessage.value = toError(error).message
    } finally {
      syncing.value = false
    }
  }

  return { status: data, loading, loadError, syncing, errorMessage, reload, sync }
}
