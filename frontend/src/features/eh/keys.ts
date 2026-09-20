import type { GallerySearch } from "@/features/eh/model"

/**
 * 查询键。content 下是受 e 站凭据影响的内容，换绑 e 站账号后整片丢掉重来（resetQueries）。
 *
 * 偏好和搜索历史不在 content 下：它们是本站的账号数据，换 e 站账号不该跟着失效；
 * 它们也只读一次，之后由本地说了算（见对应的组合式函数）。
 */
/* 所有图集详情的公共前缀。写成常量再拼，是为了让 galleryDetails 真的是 gallery 的前缀，而不是靠手抄对齐。 */
const galleryPrefix = ["eh", "content", "gallery"] as const

export const ehKeys = {
  content: ["eh", "content"] as const,
  /* 全部图集详情。清空阅读历史要把它们身上那份进度一并作废。 */
  galleryDetails: galleryPrefix,
  gallery: (gid: number, token: string) => [...galleryPrefix, gid, token] as const,
  comments: (gid: number, token: string) => ["eh", "content", "comments", gid, token] as const,
  /* 历史记录本身是本站数据，但每条都带着 e 站的图集元数据，可见性跟着凭据变，所以同属 content。 */
  history: ["eh", "content", "history"] as const,
  /* 分类数组参与哈希，顺序不同就是另一份查询，所以提交前一律去重排序。 */
  galleries: (search: GallerySearch) => ["eh", "content", "galleries", search] as const,
  preferences: ["eh", "preferences"] as const,
  searchHistory: ["eh", "searchHistory"] as const,
  credential: ["eh", "credential"] as const,
}

/** 要抓上游页面才能拿到的内容（图集元数据、评论、搜索结果）新鲜期放长：慢，而且短时间内不会变。 */
export const CONTENT_STALE_TIME = 5 * 60 * 1000
