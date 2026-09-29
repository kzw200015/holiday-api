import { Hono } from "hono"
import { z } from "zod"

import * as imageService from "@server/eh/image-service"
import { galleryPageParams } from "@server/eh/params"
import type { ImageStream } from "@server/eh/upstream/eh-client"
import { numeric } from "@server/numeric"
import { validate } from "@server/validate"

/** 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。 */
const CACHE_CONTROL = "max-age=2592000, private, immutable"

/* 签名只挡缺参数：空的、乱写的一律交给签名校验，回 403 */
const signature = z.string({ error: "图片地址缺少签名参数" })

/**
 * 两条图片接口。<img> 发的请求带不了 Authorization 头，所以它们不要求登录，改由地址里的签名认人——
 * 每条都自己校验签名。响应体是图片流，边读边转发，不把整张图读进内存。
 */
export const imageRoutes = new Hono()
  /* 大图，地址形如 .../pages/3/image?uid=&e=&s=，由 image-url 接口逐页签发 */
  .get(
    "/galleries/:gid/:token/pages/:page/image",
    validate("param", galleryPageParams),
    /* uid 是签发给谁的，e 与 s 是签名 */
    validate("query", z.object({ uid: numeric(z.int().positive(), "用户标识不合法"), e: signature, s: signature })),
    async (c) => {
      const { gid, token, page } = c.req.valid("param")
      const { uid, e, s } = c.req.valid("query")
      return forward(await imageService.openGalleryImage(uid, { gid, token }, page, { e, s }))
    },
  )
  /* 缩略图，地址形如 /thumbnail?u=&e=&s=，u 是编码过的上游地址，只接受本服务签发过的地址 */
  .get(
    "/thumbnail",
    validate("query", z.object({ u: z.string({ error: "缺少缩略图地址" }), e: signature, s: signature })),
    async (c) => {
      const { u, e, s } = c.req.valid("query")
      return forward(await imageService.openThumbnail(u, { e, s }))
    },
  )

/** 把取到的图片流转发出去：取图模块交回时已经收到第一段数据，这里只定响应头。 */
function forward(image: ImageStream): Response {
  return new Response(image.body, {
    headers: {
      "Content-Type": image.contentType,
      ...(image.contentLength !== null && { "Content-Length": String(image.contentLength) }),
      "Cache-Control": CACHE_CONTROL,
      /* 图片地址在新标签页里被直接打开时，别让浏览器把它当成网页、在本站源下执行里面的东西 */
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  })
}
