import { computed } from "vue"

import { useAsyncAction } from "@/composables/useAsyncAction"
import { useEhStore } from "@/stores/EhStore"

/**
 * 页面持有反馈状态；账号 Store 负责偏好数据本身和读写顺序。
 *
 * 偏好只有一份（跟搜索历史一样是账号级的），所以列表页和阅读器拿到的是同一份数据：
 * 在阅读器里改了翻页间隔，回到列表页不会看到一个过时的值。每个页面仍然各自持有
 * loading / 保存中 / 错误文案，因为那是「这个页面这一次操作怎么样了」，不该被别的页面看见。
 */
export function useGalleryPreferences() {
  const store = useEhStore()
  const loadAction = useAsyncAction({
    latestOnly: true,
    failureMessage: "读取浏览偏好失败，当前设置可能不是已保存的值。",
  })
  /* 分类和间隔分属两个页面，不会同时保存，共用一个 action 就够；失败文案按调用给。 */
  const saveAction = useAsyncAction()
  /* 页面上只有一处提示。保存失败排在读取失败前面：读取会随页面激活自动重来，
   * 保存不会，那条提示不该被下一次自动读取顺手抹掉。 */
  const errorMessage = computed(() => saveAction.errorMessage.value || loadAction.errorMessage.value)

  const categories = computed(() => store.preferences.categories)
  const interval = computed({
    get: () => store.preferences.readerInterval,
    /* 控件拖动时先让界面跟手，落库由 saveInterval 单独提交。 */
    set: (seconds: number) => store.setReaderInterval(seconds),
  })

  function load() {
    return loadAction.run((signal) => store.loadPreferences(signal))
  }

  function applyCategories(next: string[]) {
    return saveAction.run(() => store.saveCategories(next), {
      failureMessage: "分类保存失败，当前筛选仍然有效，但未同步到账号。",
    })
  }

  function saveInterval() {
    return saveAction.run(() => store.saveReaderInterval(interval.value), {
      failureMessage: "翻页间隔保存失败，当前间隔仍然有效，但未同步到账号。",
    })
  }

  return {
    categories,
    interval,
    loading: loadAction.pending,
    saving: saveAction.pending,
    errorMessage,
    load,
    applyCategories,
    saveInterval,
  }
}
