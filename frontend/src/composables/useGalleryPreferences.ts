import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed } from "vue"

import {
  ehKeys,
  fetchGalleryPreferences,
  saveGalleryCategories,
  saveReaderInterval,
  type GalleryPreferences,
} from "@/api/eh"

/* 后端读不到偏好行时也回这个值，两边保持一致。 */
const fallback: GalleryPreferences = { categories: [], readerInterval: 5 }

/**
 * 浏览偏好。
 *
 * 偏好只有一份（跟搜索历史一样是账号级的），所以列表页和阅读器读的是同一个查询键：
 * 在阅读器里改了翻页间隔，回到列表页不会看到一个过时的值。每个页面仍然各自持有
 * 进行中和失败文案，因为那是「这个页面这一次操作怎么样了」，不该被别的页面看见。
 */
export function useGalleryPreferences() {
  const queryClient = useQueryClient()
  const loaded = useQuery({
    queryKey: ehKeys.preferences,
    queryFn: ({ signal }) => fetchGalleryPreferences(signal),
    /* 偏好可能在别的设备上改过，回到页面就该重新问一次。 */
    staleTime: 0,
  })
  const preferences = computed(() => loaded.data.value ?? fallback)

  /* 改动先落到界面：当场生效，保存失败也不把用户刚做的选择弹回去，下次读取会把真相带回来。 */
  function apply(next: GalleryPreferences) {
    queryClient.setQueryData(ehKeys.preferences, next)
  }

  const savingCategories = useMutation({
    mutationFn: (categories: string[]) => saveGalleryCategories(categories),
  })
  const savingInterval = useMutation({
    mutationFn: (seconds: number) => saveReaderInterval(seconds),
  })

  const interval = computed({
    get: () => preferences.value.readerInterval,
    /* 控件拖动时先让界面跟手，落库由 saveInterval 单独提交。 */
    set: (seconds: number) => apply({ ...preferences.value, readerInterval: seconds }),
  })

  /* 页面上只有一处提示，显示的是最近一次保存的结果，所以发起新保存前先清掉上一次的失败。 */
  function beginSave() {
    savingCategories.reset()
    savingInterval.reset()
  }

  /* 保存失败排在读取失败前面：读取会随页面激活自动重来，
   * 保存不会，那条提示不该被下一次自动读取顺手抹掉。 */
  const errorMessage = computed(() => {
    if (savingCategories.error.value) {
      return "分类保存失败，当前筛选仍然有效，但未同步到账号。"
    }
    if (savingInterval.error.value) {
      return "翻页间隔保存失败，当前间隔仍然有效，但未同步到账号。"
    }
    return loaded.error.value ? "读取浏览偏好失败，当前设置可能不是已保存的值。" : ""
  })

  async function load() {
    await loaded.refetch()
  }

  function applyCategories(next: string[]) {
    const categories = [...next]
    apply({ ...preferences.value, categories })
    beginSave()
    return savingCategories.mutateAsync(categories).catch(() => {})
  }

  function saveInterval() {
    beginSave()
    return savingInterval.mutateAsync(interval.value).catch(() => {})
  }

  return {
    categories: computed(() => preferences.value.categories),
    interval,
    loading: loaded.isFetching,
    saving: computed(() => savingCategories.isPending.value || savingInterval.isPending.value),
    errorMessage,
    load,
    applyCategories,
    saveInterval,
  }
}
