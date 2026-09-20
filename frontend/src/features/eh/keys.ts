import type { GallerySearch } from "@/features/eh/model"

/**
 * 查询键。第二段把数据分成两类：content 是受 e 站凭据影响的内容，换绑 e 站账号后要重取；
 * account 是本站的账号数据（浏览偏好、绑定状态本身），不该跟着 e 站账号一起失效。
 */
export const ehKeys = {
  content: ["eh", "content"] as const,
  gallery: (gid: number, token: string) => ["eh", "content", "gallery", gid, token] as const,
  comments: (gid: number, token: string) => ["eh", "content", "comments", gid, token] as const,
  /* 历史记录本身是本站数据，但每条都带着 e 站的图集元数据，可见性跟着凭据变，所以同属 content。 */
  history: ["eh", "content", "history"] as const,
  /* 分类数组参与哈希，顺序不同就是另一份查询，所以提交前一律去重排序。 */
  galleries: (search: GallerySearch) => ["eh", "content", "galleries", search] as const,
  preferences: ["eh", "account", "preferences"] as const,
  searchHistory: ["eh", "account", "searchHistory"] as const,
  credential: ["eh", "account", "credential"] as const,
}

/** 要抓上游页面才能拿到的内容（图集元数据、评论、搜索结果）新鲜期放长：慢，而且短时间内不会变。 */
export const CONTENT_STALE_TIME = 5 * 60 * 1000
