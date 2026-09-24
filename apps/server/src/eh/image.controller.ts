import { Readable } from "node:stream"
import { Controller, Get, Logger, Param, Query, Res, StreamableFile } from "@nestjs/common"
import type { Response } from "express"

import { Public } from "../auth/auth.decorators.js"
import { ImageService } from "./image.service.js"
import {
  galleryImageQuery,
  galleryPageParams,
  thumbnailQuery,
  type GalleryImageQuery,
  type GalleryPageParams,
  type ThumbnailQuery,
} from "./params.js"
import type { ImageStream } from "./upstream/eh-client.js"
import { imageBroken } from "./upstream/failures.js"

/** 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。 */
const CACHE_CONTROL = "max-age=2592000, private, immutable"

/**
 * 两条图片接口。<img> 发的请求带不了 Authorization 头，所以它们不要求登录，改由地址里的签名认人——
 * 每条都自己校验签名。响应体是图片流，边读边转发，不把整张图读进内存。
 */
@Public()
@Controller("eh")
export class ImageController {
  private readonly logger = new Logger(ImageController.name)

  constructor(private readonly images: ImageService) {}

  /** 大图，地址形如 .../pages/{page}/image?uid=&e=&s=，由详情接口签发。 */
  @Get("galleries/:gid/:token/pages/:page/image")
  async galleryImage(
    @Param({ schema: galleryPageParams }) { gid, token, page }: GalleryPageParams,
    @Query({ schema: galleryImageQuery }) { uid, e, s }: GalleryImageQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(await this.images.openGalleryImage(uid, { gid, token }, page, { e, s }), response)
  }

  /** 缩略图，地址形如 /thumbnail?u=&e=&s=，只接受本服务签发过的地址。 */
  @Get("thumbnail")
  async thumbnail(
    @Query({ schema: thumbnailQuery }) { u, e, s }: ThumbnailQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(await this.images.openThumbnail(u, { e, s }), response)
  }

  private forward(image: ImageStream, response: Response): StreamableFile {
    response.setHeader("Cache-Control", CACHE_CONTROL)
    /* 图片地址在新标签页里被直接打开时，别让浏览器把它当成网页、在本站源下执行里面的东西 */
    response.setHeader("X-Content-Type-Options", "nosniff")
    response.setHeader("Content-Security-Policy", "sandbox")
    const body = Readable.fromWeb(image.body as import("node:stream/web").ReadableStream<Uint8Array>)
    /* 浏览器中途放弃（阅读器里快速翻页时成批发生）时，别在服务端把整张图白下完 */
    response.once("close", () => body.destroy())
    return new StreamableFile(body, { type: image.contentType, length: image.contentLength ?? undefined })
      .setErrorHandler((error, handlerResponse) => {
        const res = handlerResponse as unknown as Response
        const failure = imageBroken()
        this.logger.warn(`${failure.message} url=${image.source} ${error.message}`)
        if (res.headersSent) {
          /* 已经开始发图了就改不成错误响应：照常收尾的话浏览器会把半张图当成完整的缓存下来，只能直接断开连接 */
          res.destroy()
          return
        }
        /* 头还没发出去：撤掉图片的响应头（尤其是 30 天的缓存头），改回普通的错误响应 */
        for (const header of ["Cache-Control", "Content-Type", "Content-Length", "Content-Security-Policy"]) {
          res.removeHeader(header)
        }
        res.status(failure.getStatus()).json(failure.getResponse())
      })
      .setErrorLogger((error) => this.logger.debug(`客户端中途放弃了图片 url=${image.source} ${error.message}`))
  }
}
