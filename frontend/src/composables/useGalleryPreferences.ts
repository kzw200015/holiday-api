import { onScopeDispose, ref } from "vue"

import { fetchGalleryPreferences, saveGalleryCategories, saveReaderInterval } from "@/api/eh"

/** 数据库是偏好的持久来源；保存失败保留当前页面效果，但明确提示未保存。 */
export function useGalleryPreferences() {
  const categories = ref<string[]>([])
  const interval = ref(5)
  const loading = ref(true)
  const savingCategories = ref(false)
  const savingInterval = ref(false)
  const errorMessage = ref("")
  let controller: AbortController | undefined

  async function load() {
    controller?.abort()
    const request = new AbortController()
    controller = request
    loading.value = true
    errorMessage.value = ""
    try {
      const preferences = await fetchGalleryPreferences(request.signal)
      if (!request.signal.aborted) {
        categories.value = preferences.categories
        interval.value = preferences.readerInterval
      }
    } catch {
      if (!request.signal.aborted) {
        errorMessage.value = "读取浏览偏好失败，当前设置可能不是已保存的值。"
      }
    } finally {
      if (!request.signal.aborted) {
        loading.value = false
      }
    }
  }

  async function applyCategories(next: string[]) {
    categories.value = [...next]
    savingCategories.value = true
    errorMessage.value = ""
    try {
      await saveGalleryCategories(next)
    } catch {
      errorMessage.value = "分类保存失败，当前筛选仍然有效，但未同步到账号。"
    } finally {
      savingCategories.value = false
    }
  }

  async function saveInterval() {
    savingInterval.value = true
    errorMessage.value = ""
    try {
      await saveReaderInterval(interval.value)
    } catch {
      errorMessage.value = "翻页间隔保存失败，当前间隔仍然有效，但未同步到账号。"
    } finally {
      savingInterval.value = false
    }
  }

  onScopeDispose(() => controller?.abort())

  return {
    categories,
    interval,
    loading,
    savingCategories,
    savingInterval,
    errorMessage,
    load,
    applyCategories,
    saveInterval,
  }
}
