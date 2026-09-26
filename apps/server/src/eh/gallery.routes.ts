import { KEYWORD_MAX_BYTES } from "@myapi/shared/eh"
import { utf8Length } from "@myapi/shared/text"
import { Elysia } from "elysia"
import { z } from "zod"

import { signedIn } from "@server/auth/session"
import * as galleryService from "@server/eh/gallery.service"
import { categorySchema, galleryPageParams, galleryParams, minRatingSchema } from "@server/eh/params"
import { numeric } from "@server/numeric"

export const galleryRoutes = new Elysia({ prefix: "/galleries" })
  .use(signedIn)
  /*
   * 游标式分页。这是一次读取，走 POST 只是因为条件里有分类数组：塞进查询串就得两头各写一份拼拆规则，所以整条走 JSON 请求体。
   * 关键词去两端空白由前端在提交前做，这里原样校验。
   */
  .post("/search", ({ userId, body }) => galleryService.search(userId, body), {
    body: z.object({
      keyword: z
        .string({ error: "关键词太长了" })
        .refine((keyword) => utf8Length(keyword) <= KEYWORD_MAX_BYTES, "关键词太长了")
        .default(""),
      categories: z.array(categorySchema).default([]),
      minRating: minRatingSchema.default(null),
      /* 空串表示第一页；它是 e 站给的一串数字，会被拼进上游地址 */
      cursor: z
        .string({ error: "分页游标不合法" })
        .regex(/^\d{0,20}$/, "分页游标不合法")
        .default(""),
    }),
  })
  .get("/:gid/:token", ({ params }) => galleryService.detail(params), { params: galleryParams })
  /* 阅读器每取一页先来签一次，点重试时也再签一次，所以地址不会拿着过期的用 */
  .get(
    "/:gid/:token/pages/:page/image-url",
    ({ userId, params: { gid, token, page } }) => galleryService.imageUrl(userId, { gid, token }, page),
    { params: galleryPageParams },
  )
  /* 单独一次请求，不拖慢详情页首屏 */
  .get("/:gid/:token/comments", ({ userId, params }) => galleryService.comments(userId, params), {
    params: galleryParams,
  })
  /* 预览图按上游的分片取，详情页滚到哪一片才取哪一片 */
  .get(
    "/:gid/:token/previews/:slice",
    ({ userId, params: { gid, token, slice } }) => galleryService.previews(userId, { gid, token }, slice),
    /* 从 0 起，会被拼进上游地址 */
    { params: galleryParams.extend({ slice: numeric(z.int().min(0), "分片序号不合法") }) },
  )
