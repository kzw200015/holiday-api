import { DEFAULT_GALLERY_PREFERENCES } from "@myapi/shared/eh"
import { useQueryCache } from "@pinia/colada"
import { defineStore } from "pinia"
import { ref, shallowRef, watch } from "vue"

import { useAuthStore } from "@/features/auth/store"
import type { GalleryDetail, GalleryPreferences, GallerySearch } from "@/features/eh/api"
import { normalizeFilters, type GalleryFilters } from "@/features/eh/composables/useGalleryPreferences"
import { ehKeys } from "@/features/eh/queries"
import { keepFirstPage } from "@/shared/api/queries"

/** 一次搜索的条件：关键词已去两端空白，筛选条件已规整（分类去重排序）。 */
type SearchCriteria = Omit<GallerySearch, "cursor">

/**
 * 图集搜索此刻搜的是什么：输入框里的草稿与已提交的条件。
 *
 * 搜索页之外也会发起搜索（详情页点标签、上传者），两处是兄弟页面，改的是同一份状态，所以放在 store 里。
 * 搜索结果仍在查询缓存里，由搜索页按这份条件去取；提交时这里就把缓存理好，搜索页被 KeepAlive 留着时它的查询也还挂着，
 * 条件一变当场去取，不必等回到搜索页。换本站账号时回到还没搜过的样子。
 */
export const useGallerySearchStore = defineStore("GallerySearch", () => {
  const auth = useAuthStore()
  const queryCache = useQueryCache()
  const draft = ref("")
  /* 每提交一次都是一个新对象，条件没变也认得出又提交了一次；null 表示这个账号还没搜过 */
  const submitted = shallowRef<SearchCriteria | null>(null)

  watch(
    () => auth.pageRevision,
    () => {
      draft.value = ""
      submitted.value = null
    },
  )

  /**
   * 偏好里的筛选条件，也就是搜索页筛选面板上显示的那组：用到它的页面都在 EhLayout 里，那时偏好已经读到了。
   * 从缓存里直接取而不经 useGalleryPreferences：那会挂上一个查询，每个用到这里的页面挂载时都重读一次偏好。
   */
  function preferredFilters() {
    const preferences = queryCache.getQueryData<GalleryPreferences>(ehKeys.preferences) ?? DEFAULT_GALLERY_PREFERENCES
    return normalizeFilters(preferences)
  }

  /** 此刻的条件。还没搜过时是空关键词加偏好里的筛选条件。 */
  function current(): SearchCriteria {
    return submitted.value ?? { keyword: "", ...preferredFilters() }
  }

  /**
   * 提交一次搜索：没给关键词就用草稿，没给筛选条件就用偏好里的，与面板上显示的一致，
   * 而不是上次提交的：偏好可能在别处改过、重读过，或保存失败被按了回去。回的是提交的条件。
   */
  function submit({
    keyword = draft.value,
    filters = preferredFilters(),
  }: { keyword?: string; filters?: GalleryFilters } = {}) {
    const criteria = { keyword: keyword.trim(), ...normalizeFilters(filters) }
    draft.value = criteria.keyword
    /* 旧条件还在途的那次不必等了：上游一页要好几秒，换了条件它的结果也不再显示。要在换条件之前取消，免得连新的一起取消掉。 */
    queryCache.cancelQueries({ key: ehKeys.searches })
    submitted.value = criteria
    /*
     * 列表按时间倒序，重按搜索就是想看有没有新的：哪怕条件没变、缓存里有这组条件翻过的页，也只留第一页重读。
     * 条件没变时搜索页的查询还挂在这一条上，作废就当场重读；条件变了，搜索页换到这一条时它已经过期，也会重读。
     * 失败记在查询的状态里，由搜索页显示，这里不再处理。
     */
    const key = ehKeys.search(criteria)
    keepFirstPage(queryCache, { key, exact: true })
    queryCache.invalidateQueries({ key, exact: true }).catch(() => {})
    return criteria
  }

  return { draft, submitted, current, submit }
})

/**
 * 按标签精确搜的写法，与 e 站自己点标签时一致：值加引号，$ 表示整个标签精确匹配。
 * 临时标签 e 站不带前缀，服务端把它归到 temp（见服务端 eh-client.ts 的 TEMP_NAMESPACE），搜的时候还原成不带前缀。
 */
export function tagKeyword({ namespace, value }: Pick<GalleryDetail["tags"][number], "namespace" | "value">) {
  return namespace === "temp" ? `"${value}$"` : `${namespace}:"${value}$"`
}

export function uploaderKeyword(uploader: string) {
  return `uploader:"${uploader}"`
}
