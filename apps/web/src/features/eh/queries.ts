import type { QueryCache } from "@pinia/colada"
import { defineStore } from "pinia"

import { useAuthStore } from "@/features/auth/store"
import type { GallerySearch } from "@/features/eh/api"
import { keepFirstPage } from "@/shared/api/queries"
import { createWrites } from "@/shared/api/writes"

/* 带参数的几类数据的前缀：按前缀作废或改写时用 */
const SEARCH = ["eh", "search"] as const
const GALLERY = ["eh", "gallery"] as const
const COMMENTS = ["eh", "comments"] as const
const PREVIEWS = ["eh", "previews"] as const
const PROGRESS = ["eh", "progress"] as const

/** 图集浏览各份数据的缓存 key。都以 `eh` 开头；带参数的几类以各自的前缀开头，可以整类作废。 */
export const ehKeys = {
  credential: ["eh", "credential"],
  preferences: ["eh", "preferences"],
  searchHistory: ["eh", "search-history"],
  searches: SEARCH,
  /* 搜索的缓存 key 就是提交给搜索接口的那组条件 */
  search: (keyword: string, categories: GallerySearch["categories"], minRating: GallerySearch["minRating"]) => [
    ...SEARCH,
    keyword,
    categories,
    minRating,
  ],
  gallery: (gid: number, token: string) => [...GALLERY, gid, token],
  /* 不按前缀作废：卸载就不留缓存，换绑 e 站账号也不影响签名 */
  pageImage: (gid: number, token: string, page: number) => ["eh", "page-image", gid, token, page],
  comments: (gid: number, token: string) => [...COMMENTS, gid, token],
  previews: (gid: number, token: string, slice: number) => [...PREVIEWS, gid, token, slice],
  progresses: PROGRESS,
  progress: (gid: number) => [...PROGRESS, gid],
  history: ["eh", "history"],
  tagTranslations: ["eh", "tag-translations"],
} as const

/**
 * 换绑 e 站账号后能看到的内容变了：搜索结果与阅读历史只留第一页重读（不把翻过的每一页都向上游重抓一遍），
 * 详情、评论与预览图作废重读（每片几页随账号设置变）。本站账号的数据（偏好、搜索历史、阅读进度）不受牵连。
 */
export function invalidateEhContent(queryCache: QueryCache) {
  keepFirstPage(queryCache, { key: SEARCH })
  keepFirstPage(queryCache, { key: ehKeys.history })
  return Promise.all(
    [SEARCH, GALLERY, COMMENTS, PREVIEWS, ehKeys.history].map((key) => queryCache.invalidateQueries({ key })),
  )
}

/**
 * 本站账号数据的写入（见 ADR-0006）：偏好与搜索历史的改动依次发出；进度上报与阅读历史的删除当场发出、不排队。
 * 读这些数据之前一律先等已经发出的写入落地，不区分是哪一类：多等的也就是一次写入的时间。
 *
 * 放在 store 里而不是模块级：跟着 Pinia 实例走，每个应用（每个测试）各有一份，互不牵连。
 */
export const useEhWrites = defineStore("EhWrites", () => {
  const auth = useAuthStore()
  return createWrites(() => auth.pageRevision)
})
