import { readerIntervalSchema, searchHistoryEntrySchema } from "@myapi/shared/eh"
import { Elysia } from "elysia"
import { z } from "zod"

import { signedIn } from "@server/auth/session"
import { categorySchema, minRatingSchema } from "@server/eh/params"
import * as preferencesService from "@server/eh/preferences.service"

/* 记一个词、删一个词：记的是请求体，删的是查询串 */
const searchKeyword = z.object({ keyword: searchHistoryEntrySchema })

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
    /* 只带要改的字段，没带的保持原样，所以两处各改各的字段不会互相覆盖 */
    {
      body: z
        .object({
          categories: z.array(categorySchema),
          minRating: minRatingSchema,
          readerInterval: readerIntervalSchema,
        })
        .partial(),
    },
  )
  .get("/search-history", ({ userId }) => preferencesService.searchHistory(userId))
  .post(
    "/search-history",
    async ({ userId, body }) => {
      await preferencesService.recordSearch(userId, body.keyword)
    },
    { body: searchKeyword },
  )
  /* 要删的词放查询串：它可能是 `..` 这类放进路径会被浏览器规范化掉的写法 */
  .delete(
    "/search-history/entry",
    async ({ userId, query }) => {
      await preferencesService.removeSearch(userId, query.keyword)
    },
    { query: searchKeyword },
  )
  .delete("/search-history", async ({ userId }) => {
    await preferencesService.clearSearchHistory(userId)
  })
