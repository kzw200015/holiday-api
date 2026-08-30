import { defineStore } from "pinia"
import { ref, shallowRef, triggerRef } from "vue"

import { type GalleryCard, searchGalleries } from "@/api/eh"
import { errorText } from "@/api/httpClient"

/*
 * 图库列表的全部状态：已加载的条目、游标、加载中与出错。
 *
 * 放 store 而不是靠 KeepAlive 缓存组件：阅读视图是顶层路由，进去时整个 AppLayout
 * 连同它里面的 KeepAlive 一起卸载，缓存就没了。放这里则无论从哪条路径回来都还在，
 * 配合路由的 scrollBehavior 就能接着往下翻。
 *
 * 翻页的状态迁移（出错后停下、重试时恢复）也一并放这儿，页面只读不写：
 * 这套「出错就把 hasMore 置 false」的手法写在组件里的话，下一个游标列表会照抄一遍，
 * 抄错一个分支就是无限重试，把上游的限速额度打爆。
 */
export const useGalleryListStore = defineStore("GalleryListStore", () => {
  /* 卡片加载后不再改动，用 shallowRef 免得给每张卡和它的 tags 数组都套一层 Proxy */
  const items = shallowRef<GalleryCard[]>([])

  /* 下一页的游标，空串表示从头开始 */
  const cursor = ref("")
  const hasMore = ref(true)
  const loading = ref(false)
  const errorMessage = ref("")

  /* 已经应用的搜索条件。为 null 表示还没搜过，用来区分「换了条件」和「原路返回」 */
  const signature = ref<string | null>(null)

  /* 游标不携带筛选条件，翻页时要把它们原样重发，所以得留着 */
  const keyword = ref("")
  const categories = ref<string[]>([])

  /** 换了搜索条件时清空重来。 */
  function reset(nextSignature: string, query: { keyword: string; categories: string[] }) {
    signature.value = nextSignature
    keyword.value = query.keyword
    categories.value = query.categories
    items.value = []
    cursor.value = ""
    hasMore.value = true
    errorMessage.value = ""
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) {
      return
    }
    loading.value = true
    errorMessage.value = ""
    try {
      const page = await searchGalleries({ keyword: keyword.value, categories: categories.value, cursor: cursor.value })
      /* 原地 push 而不是重建数组：翻二十页会白拷贝几千个元素 */
      items.value.push(...page.items)
      triggerRef(items)
      cursor.value = page.nextCursor ?? ""
      hasMore.value = page.nextCursor !== null
    } catch (error) {
      errorMessage.value = errorText(error, "加载失败")
      /* 出错就停下，否则滚动会一直重试，把上游的限速额度耗光 */
      hasMore.value = false
    } finally {
      loading.value = false
    }
  }

  /** 从出错状态恢复：把因为报错关掉的闸门打开再试一次。 */
  async function retry() {
    errorMessage.value = ""
    hasMore.value = true
    await loadMore()
  }

  return { items, cursor, hasMore, loading, errorMessage, signature, reset, loadMore, retry }
})
