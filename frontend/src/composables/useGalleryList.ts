import { computed, onScopeDispose, ref, shallowRef, triggerRef } from "vue"

import { type GalleryCard, searchGalleries } from "@/api/eh"

/** 游标不包含筛选条件，每次翻页都要重发同一份查询。 */
interface GallerySearch {
  keyword: string
  categories: string[]
}

/* 状态属于列表组件实例，离开时由 KeepAlive 保留，淘汰时取消在途请求。 */
export function useGalleryList() {
  /* 卡片只追加，用浅引用避免给每张卡片及其标签创建 Proxy。 */
  const items = shallowRef<GalleryCard[]>([])
  const query = shallowRef<GallerySearch | null>(null)
  const cursor = ref<string | null>(null)
  const loading = ref(false)
  const errorMessage = ref("")
  const hasMore = computed(() => cursor.value !== null)
  let activeRequest: AbortController | undefined

  function clear() {
    /* 换搜索条件或组件销毁后，未完成的响应同样属于旧缓存。 */
    activeRequest?.abort()
    activeRequest = undefined
    query.value = null
    items.value = []
    cursor.value = null
    loading.value = false
    errorMessage.value = ""
  }

  async function search(next: GallerySearch) {
    const categories = [...new Set(next.categories)].sort()
    if (query.value?.keyword === next.keyword && query.value.categories.join(",") === categories.join(",")) {
      return
    }
    clear()
    query.value = { keyword: next.keyword, categories }
    cursor.value = ""
    await loadMore()
  }

  async function loadMore() {
    if (!query.value || loading.value || cursor.value === null || errorMessage.value) {
      return
    }
    const controller = new AbortController()
    activeRequest = controller
    loading.value = true
    try {
      const page = await searchGalleries({ ...query.value, cursor: cursor.value }, controller.signal)
      if (controller.signal.aborted) {
        return
      }
      /* 原地追加，避免翻页越多、复制已有条目的开销越大。 */
      items.value.push(...page.items)
      triggerRef(items)
      cursor.value = page.nextCursor
    } catch (error) {
      if (!controller.signal.aborted) {
        /* 保留游标供手动重试；错误单独阻止触底加载，避免耗尽上游限速额度。 */
        errorMessage.value = (error as Error).message
      }
    } finally {
      if (!controller.signal.aborted) {
        activeRequest = undefined
        loading.value = false
      }
    }
  }

  async function retry() {
    errorMessage.value = ""
    await loadMore()
  }

  onScopeDispose(clear)
  return { items, hasMore, loading, errorMessage, search, loadMore, retry }
}
