import { galleryPreferencesPatchSchema, searchHistoryKeywordSchema } from "@myapi/shared/eh"
import { Elysia } from "elysia"

import { signedIn } from "@server/auth/session"
import * as preferencesService from "@server/eh/preferences.service"

/**
 * 本站账号的浏览偏好与搜索历史。写接口都与到达顺序无关（见 ADR-0006）：偏好只改带来的字段，搜索历史一次记或删一个词，
 * 排序、去重、留几条由这边做。都只回成败，前端当场按同一条规则改好了本地那份。
 */
export const preferencesRoutes = new Elysia()
  .use(signedIn)
  .get("/preferences", ({ userId }) => preferencesService.preferences(userId))
  .patch(
    "/preferences",
    async ({ userId, body }) => {
      await preferencesService.patchPreferences(userId, body)
    },
    { body: galleryPreferencesPatchSchema },
  )
  .get("/search-history", ({ userId }) => preferencesService.searchHistory(userId))
  .post(
    "/search-history",
    async ({ userId, body }) => {
      await preferencesService.recordSearch(userId, body.keyword)
    },
    { body: searchHistoryKeywordSchema },
  )
  /* 要删的词放查询串：它可能是 `..` 这类放进路径会被浏览器规范化掉的写法 */
  .delete(
    "/search-history/entry",
    async ({ userId, query }) => {
      await preferencesService.removeSearch(userId, query.keyword)
    },
    { query: searchHistoryKeywordSchema },
  )
  .delete("/search-history", async ({ userId }) => {
    await preferencesService.clearSearchHistory(userId)
  })
