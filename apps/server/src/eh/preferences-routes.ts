import { readerIntervalSchema, searchHistoryEntrySchema } from "@myapi/shared/eh"
import { Hono } from "hono"
import { z } from "zod"

import { signedIn } from "@server/auth/session"
import { categorySchema, minRatingSchema } from "@server/eh/params"
import * as preferencesService from "@server/eh/preferences-service"
import { validate } from "@server/validate"

/* 记一个词、删一个词：记的是请求体，删的是查询串 */
const searchKeyword = z.object({ keyword: searchHistoryEntrySchema })

/**
 * 本站账号的浏览偏好与搜索历史。写接口都与到达顺序无关（见 ADR-0006）：偏好只改带来的字段，搜索历史一次记或删一个词，
 * 排序、去重、留几条由这边做。都只回成败，前端当场按同一条规则改好了本地那份。
 */
export const preferencesRoutes = new Hono()
  .get("/preferences", signedIn, async (c) => c.json(await preferencesService.preferences(c.get("userId"))))
  .patch(
    "/preferences",
    signedIn,
    /* 只带要改的字段，没带的保持原样，所以两处各改各的字段不会互相覆盖 */
    validate(
      "json",
      z
        .object({
          categories: z.array(categorySchema),
          minRating: minRatingSchema,
          readerInterval: readerIntervalSchema,
        })
        .partial(),
    ),
    async (c) => {
      await preferencesService.patchPreferences(c.get("userId"), c.req.valid("json"))
      return c.body(null, 204)
    },
  )
  .get("/search-history", signedIn, async (c) => c.json(await preferencesService.searchHistory(c.get("userId"))))
  .post("/search-history", signedIn, validate("json", searchKeyword), async (c) => {
    await preferencesService.recordSearch(c.get("userId"), c.req.valid("json").keyword)
    return c.body(null, 204)
  })
  /* 要删的词放查询串：它可能是 `..` 这类放进路径会被浏览器规范化掉的写法 */
  .delete("/search-history/entry", signedIn, validate("query", searchKeyword), async (c) => {
    await preferencesService.removeSearch(c.get("userId"), c.req.valid("query").keyword)
    return c.body(null, 204)
  })
  .delete("/search-history", signedIn, async (c) => {
    await preferencesService.clearSearchHistory(c.get("userId"))
    return c.body(null, 204)
  })
