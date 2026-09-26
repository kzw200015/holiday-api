import { galleryTokenSchema, gidSchema, pageSchema } from "@myapi/shared/eh"
import { z } from "zod"

import type { GalleryRef } from "@server/eh/upstream/gallery-ref"
import { numeric } from "@server/numeric"

export const gidParam = numeric(gidSchema, "图集编号不合法")

/** 路径上的图集定位信息，校验后就是 GalleryRef。 */
export const galleryParams = z.object({ gid: gidParam, token: galleryTokenSchema }) satisfies z.ZodType<GalleryRef>

export const galleryPageParams = galleryParams.extend({ page: numeric(pageSchema, "页码不合法") })

/** 详情页的第几片，从 0 起：会被拼进上游地址。 */
export const gallerySliceParams = galleryParams.extend({ slice: numeric(z.int().min(0), "分片序号不合法") })
/* 只挡缺参数：空的、乱写的一律交给签名校验，回 403 */
const signature = z.string({ error: "图片地址缺少签名参数" })

/** 大图地址的查询串：uid 是签发给谁的，e 与 s 是签名。 */
export const galleryImageQuery = z.object({
  uid: numeric(z.int().positive(), "用户标识不合法"),
  e: signature,
  s: signature,
})
/** 缩略图地址的查询串：u 是编码过的上游地址。 */
export const thumbnailQuery = z.object({
  u: z.string({ error: "缺少缩略图地址" }),
  e: signature,
  s: signature,
})
