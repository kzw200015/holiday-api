import { Elysia } from "elysia"
import { z } from "zod"

import * as imageService from "@server/eh/image.service"
import { galleryPageParams } from "@server/eh/params"
import type { ImageStream } from "@server/eh/upstream/eh-client"
import { imageBroken } from "@server/eh/upstream/failures"
import { Logger } from "@server/logger"
import { numeric } from "@server/numeric"

/** 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。 */
const CACHE_CONTROL = "max-age=2592000, private, immutable"

const logger = new Logger(import.meta.url)

/* 签名只挡缺参数：空的、乱写的一律交给签名校验，回 403 */
const signature = z.string({ error: "图片地址缺少签名参数" })

/**
 * 两条图片接口。<img> 发的请求带不了 Authorization 头，所以它们不要求登录，改由地址里的签名认人——
 * 每条都自己校验签名。响应体是图片流，边读边转发，不把整张图读进内存。
 */
export const imageRoutes = new Elysia()
  /* 大图，地址形如 .../pages/3/image?uid=&e=&s=，由 image-url 接口逐页签发 */
  .get(
    "/galleries/:gid/:token/pages/:page/image",
    async ({ params: { gid, token, page }, query: { uid, e, s } }) =>
      forward(await imageService.openGalleryImage(uid, { gid, token }, page, { e, s })),
    {
      params: galleryPageParams,
      /* uid 是签发给谁的，e 与 s 是签名 */
      query: z.object({ uid: numeric(z.int().positive(), "用户标识不合法"), e: signature, s: signature }),
    },
  )
  /* 缩略图，地址形如 /thumbnail?u=&e=&s=，u 是编码过的上游地址，只接受本服务签发过的地址 */
  .get("/thumbnail", async ({ query: { u, e, s } }) => forward(await imageService.openThumbnail(u, { e, s })), {
    query: z.object({ u: z.string({ error: "缺少缩略图地址" }), e: signature, s: signature }),
  })

/**
 * 把上游的图片流转发出去。先等到第一段数据再发响应头：一个字节都没传就断了的，还能改回普通的 502，
 * 不带图片的响应头（尤其是 30 天的缓存头）。已经开始发图之后再断，就只能让这个流出错、由 Bun 直接断开连接——
 * 照常收尾的话浏览器会把半张图当成完整的缓存下来。浏览器中途放弃（阅读器里快速翻页时成批发生）时取消上游，
 * 别在服务端把整张图白下完。
 */
async function forward(image: ImageStream): Promise<Response> {
  const reader = image.body.getReader()
  const first = await reader.read().catch((error: unknown) => {
    throw imageBroken(image.source, error)
  })
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) {
        controller.close()
      } else {
        controller.enqueue(first.value)
      }
    },
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          controller.close()
        } else {
          controller.enqueue(chunk.value)
        }
      } catch (error) {
        /* imageBroken 在创建时记日志，这里只用它记下这次失败 */
        controller.error(imageBroken(image.source, error))
      }
    },
    cancel(reason) {
      logger.debug(`客户端中途放弃了图片 url=${image.source} ${String(reason)}`)
      return reader.cancel(reason)
    },
  })
  return new Response(body, {
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
