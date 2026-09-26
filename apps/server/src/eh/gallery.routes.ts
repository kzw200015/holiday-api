import { gallerySearchSchema } from "@myapi/shared/eh"
import { Elysia } from "elysia"

import { signedIn } from "@server/auth/session"
import * as galleryService from "@server/eh/gallery.service"
import { galleryPageParams, galleryParams, gallerySliceParams } from "@server/eh/params"

export const galleryRoutes = new Elysia({ prefix: "/galleries" })
  .use(signedIn)
  /* 游标式分页。这是一次读取，走 POST 只是因为条件里有分类数组 */
  .post("/search", ({ userId, body }) => galleryService.search(userId, body), { body: gallerySearchSchema })
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
    { params: gallerySliceParams },
  )
