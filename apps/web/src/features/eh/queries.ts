import type { GalleryCategory } from "@myapi/shared/eh"
import type { QueryCache } from "@pinia/colada"
import { defineStore } from "pinia"
import { markRaw } from "vue"

import { useAuthStore } from "@/features/auth/store"
import { keepFirstPage } from "@/shared/api/queries"
import { createWrites } from "@/shared/api/writes"

/* 带参数的几类数据的前缀：按前缀作废或改写时用 */
const SEARCH = ["eh", "search"] as const
const GALLERY = ["eh", "gallery"] as const
const COMMENTS = ["eh", "comments"] as const
const PROGRESS = ["eh", "progress"] as const

/** 图集浏览各份数据的缓存 key。都以 `eh` 开头；带参数的几类以各自的前缀开头，可以整类作废。 */
export const ehKeys = {
  credential: ["eh", "credential"],
  preferences: ["eh", "preferences"],
  searchHistory: ["eh", "search-history"],
  searches: SEARCH,
  search: (keyword: string, categories: GalleryCategory[]) => [...SEARCH, keyword, categories],
  gallery: (gid: number, token: string) => [...GALLERY, gid, token],
  comments: (gid: number, token: string) => [...COMMENTS, gid, token],
  progresses: PROGRESS,
  progress: (gid: number) => [...PROGRESS, gid],
  history: ["eh", "history"],
  tagTranslations: ["eh", "tag-translations"],
} as const

/**
 * 换绑 e 站账号后能看到的内容变了：搜索结果与阅读历史只留第一页重读（不把翻过的每一页都向上游重抓一遍），
 * 详情与评论作废重读。本站账号的数据（偏好、搜索历史、阅读进度）不受牵连。
 */
export function invalidateEhContent(queryCache: QueryCache) {
  keepFirstPage(queryCache, { key: SEARCH })
  keepFirstPage(queryCache, { key: ehKeys.history })
  return Promise.all([SEARCH, GALLERY, COMMENTS, ehKeys.history].map((key) => queryCache.invalidateQueries({ key })))
}

/**
 * 本站账号数据的写入（见 ADR-0006）：偏好与搜索历史的改动依次发出，读它们之前先等落地；
 * 阅读进度不排队，但读进度与阅读历史之前同样先等它落地。
 *
 * 放在 store 里而不是模块级：跟着 Pinia 实例走，每个应用（每个测试）各有一份，互不牵连。
 */
export const useEhWrites = defineStore("EhWrites", () => {
  const auth = useAuthStore()
  return {
    account: markRaw(createWrites(() => auth.pageRevision)),
    progress: markRaw(createWrites()),
  }
})
