import { Hono } from "hono"
import { z } from "zod"
import { apiValidator } from "../web/apiValidator"
import type { AccessLogEnv } from "../web/requestLogger"
import { galleryPageSchema } from "./ehModels"
import type { EhService, ImageStream } from "./ehService"

/**
 * 签名附件地址上固定的两个参数：过期时间与签名。这里只管「有没有」，签名对不对由 service 校验。
 * 每个字段的文案要写两遍，因为 z.string 的 error 只覆盖类型不符，min 是另一条规则。
 */
const signatureFields = {
  e: z.string({ error: "缺少过期时间" }).min(1, { error: "缺少过期时间" }),
  s: z.string({ error: "缺少签名" }).min(1, { error: "缺少签名" }),
}

const thumbnailQuerySchema = z.object({
  u: z.string({ error: "缺少缩略图地址" }).min(1, { error: "缺少缩略图地址" }),
  ...signatureFields,
})

const imageQuerySchema = z.object({
  uid: z.coerce.number({ error: "用户标识不合法" }).int().positive({ error: "用户标识不合法" }),
  ...signatureFields,
})

/** 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。 */
const IMAGE_CACHE_CONTROL = "private, max-age=2592000, immutable"

export type EhImageControllerService = Pick<EhService, "openGalleryImage" | "openThumbnail">

/**
 * 两个图片接口，同样挂在 /api/eh 下，但**不要求登录**。
 *
 * <img src> 是浏览器自己发的请求，带不了 Authorization 头也就拿不到 JWT，
 * 所以这两个接口靠地址里的签名认身份：签名由 service 签发，覆盖「这是哪一份附件、给谁看、什么时候过期」。
 * 它们也是统一 ApiResponse 契约的唯一例外，直接返回二进制流。
 *
 * 单独一个类、单独一个文件而不是在 EhController 里挑几条路由豁免，是因为「哪些接口不需要登录」
 * 必须一眼看得出来：混在一起的话，日后加接口时很容易顺手加到不设防的那一侧。
 * 挂载顺序也有讲究，见 app.ts。
 *
 * 两条路由各自设 quietAccessLog（访问日志降到 debug，见 web/requestLogger.ts），
 * 而不是在这里 use 一个中间件：两个控制器挂在同一个前缀下，
 * 子应用里的 use("*") 会变成整个 /api/eh/* 的中间件，把 EhController 的路由一起罩进去。
 */
export class EhImageController extends Hono<AccessLogEnv> {
  constructor(ehService: EhImageControllerService) {
    super()

    /** GET /api/eh/galleries/:gid/:token/pages/:page/image?uid=&e=&s=，流式转发大图。 */
    this.get(
      "/galleries/:gid/:token/pages/:page/image",
      apiValidator("param", galleryPageSchema),
      apiValidator("query", imageQuerySchema),
      async (c) => {
        c.set("quietAccessLog", true)
        const { gid, token, page } = c.req.valid("param")
        const { uid, e, s } = c.req.valid("query")
        const image = await ehService.openGalleryImage({
          userId: uid,
          gid,
          token,
          page,
          signature: { expiresAt: e, signature: s },
        })
        return streamImage(image)
      },
    )

    /** GET /api/eh/thumbnail?u=&e=&s=，只接受本服务签发过的地址。 */
    this.get("/thumbnail", apiValidator("query", thumbnailQuerySchema), async (c) => {
      c.set("quietAccessLog", true)
      const { u, e, s } = c.req.valid("query")
      return streamImage(await ehService.openThumbnail(u, { expiresAt: e, signature: s }))
    })
  }
}

/** 流式转发，不把整张图读进内存。 */
function streamImage({ body, contentType, contentLength }: ImageStream): Response {
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": IMAGE_CACHE_CONTROL })
  if (contentLength) {
    headers.set("Content-Length", contentLength)
  }
  return new Response(body, { headers })
}
