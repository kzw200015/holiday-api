import { GALLERY_CATEGORIES, GALLERY_MIN_RATINGS } from "@myapi/shared/eh"
import { z } from "zod"

import { galleryTokenSchema, type GalleryRef } from "@server/eh/upstream/gallery-ref"
import { numeric } from "@server/numeric"

/* eh 几组路由共用的入参 schema。只有一条路由用的，直接写在那条路由上。 */

/** 页码、上报序号这类落在 PostgreSQL integer 列里的正整数。 */
export const positiveInt32 = (message: string) =>
  z.int({ error: message }).min(1, { error: message }).max(2_147_483_647, { error: message })

/** 图集编号。它会被拼进上游地址，所以从外部来的都得先过这一道。 */
export const gidSchema = z.int({ error: "图集编号不合法" }).positive({ error: "图集编号不合法" })

/** 页码从 1 起。 */
export const pageSchema = positiveInt32("页码不合法")

/** 搜索条件与偏好里的分类。 */
export const categorySchema = z.enum(GALLERY_CATEGORIES, { error: "分类名不合法" })

/** 最低评分，null 表示不限。它会被拼进上游地址。 */
export const minRatingSchema = z.literal(GALLERY_MIN_RATINGS, { error: "最低评分应为 2–5 星" }).nullable()

export const gidParam = numeric(gidSchema, "图集编号不合法")

/** 路径上的图集定位信息，校验后就是 GalleryRef。 */
export const galleryParams = z.object({ gid: gidParam, token: galleryTokenSchema }) satisfies z.ZodType<GalleryRef>

export const galleryPageParams = galleryParams.extend({ page: numeric(pageSchema, "页码不合法") })
