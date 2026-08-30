import { Hono } from "hono"
import { z } from "zod"
import { badRequest, ok } from "../apiresponse/apiResponse"
import type { SessionCookie, SessionEnv } from "../auth/sessionCookie"
import { apiValidator } from "../web/apiValidator"
import { ehCookieSchema } from "./ehModels"
import { CATEGORY_NAMES, type EhService, type ImageStream } from "./ehService"

/**
 * 图集的定位参数。token 固定 10 位十六进制——这两项会被拼进上游地址，
 * 不校验就等于把用户输入直接发给 e 站。
 */
const galleryRefSchema = z.object({
  gid: z.coerce.number({ error: "图集编号不合法" }).int().positive({ error: "图集编号不合法" }),
  token: z.string().regex(/^[0-9a-f]{10}$/, { error: "图集令牌不合法" }),
})

/** 取图和上报进度的入参一样：图集定位加一个页码。 */
const pageParamSchema = galleryRefSchema.extend({
  page: z.coerce.number({ error: "页码不合法" }).int().positive({ error: "页码不合法" }),
})

/**
 * 搜索参数。分类用名字的逗号列表传，位掩码的换算封在 service 里：
 * f_cats 传的是「排除哪些」，这个方向不该泄露到接口和前端。
 */
const searchQuerySchema = z.object({
  keyword: z.string().max(200, { error: "关键词太长了" }).optional().default(""),
  categories: z
    .string()
    .optional()
    .default("")
    .transform((text) => text.split(",").filter(Boolean))
    // 认不出的分类名不能默默忽略：那一位掩码会算成 0，表现是「筛选点了但结果没变」
    .pipe(z.array(z.enum(CATEGORY_NAMES, { error: "分类名不合法" }))),
  cursor: z
    .string()
    .regex(/^\d*$/, { error: "分页游标不合法" })
    .optional()
    .default(""),
  /** 显式指定前站，用于有里站权限但想看前站的场合；不传就用当前账号能到的最好的那个。 */
  site: z.literal("e").optional(),
})

const thumbnailQuerySchema = z.object({
  u: z.string().min(1, { error: "缺少缩略图地址" }),
  s: z.string().min(1, { error: "缺少签名" }),
})

/** 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。 */
const IMAGE_CACHE_CONTROL = "private, max-age=2592000, immutable"

/**
 * e 站相关的 HTTP 接口，挂载在 /api/eh 下。
 *
 * 整个子路由都要求登录：会话校验挂在这里而不是 app.use("/api/*")，
 * 因为 GET /api/holiday/is-holiday 有外部调用方，挂全局会把它一起挡掉。
 *
 * 两个图片接口是统一 ApiResponse 契约的唯一例外，它们直接返回二进制流。
 */
export type EhControllerService = Pick<
  EhService,
  | "getCredentialStatus"
  | "bindCredential"
  | "unbindCredential"
  | "searchGalleries"
  | "getGalleryDetail"
  | "getGalleryComments"
  | "openGalleryImage"
  | "openThumbnail"
  | "saveProgress"
>

export function createEhController({
  ehService,
  sessionCookie,
}: {
  ehService: EhControllerService
  sessionCookie: SessionCookie
}) {
  return (
    new Hono<SessionEnv>()
      .use("*", sessionCookie.middleware)

      /** GET /api/eh/credential，返回绑定状态，不含明文 Cookie。 */
      .get("/credential", async (c) => {
        return c.json(ok(await ehService.getCredentialStatus(c.get("userId"))))
      })

      /** POST /api/eh/credential，绑定前先拿这组 Cookie 实际请求一次，无效直接 400。 */
      .post("/credential", apiValidator("json", ehCookieSchema), async (c) => {
        const result = await ehService.bindCredential(c.get("userId"), c.req.valid("json"))
        return result.ok ? c.json(ok(result.status)) : c.json(badRequest(result.msg), 400)
      })

      /** POST /api/eh/credential/unbind，解绑后退回匿名浏览前站。 */
      .post("/credential/unbind", async (c) => {
        await ehService.unbindCredential(c.get("userId"))
        return c.json(ok(null))
      })

      /** GET /api/eh/galleries?keyword=&categories=&cursor=，游标式分页。 */
      .get("/galleries", apiValidator("query", searchQuerySchema), async (c) => {
        return c.json(ok(await ehService.searchGalleries(c.get("userId"), c.req.valid("query"))))
      })

      /** GET /api/eh/galleries/:gid/:token，元数据加该用户的阅读进度。 */
      .get("/galleries/:gid/:token", apiValidator("param", galleryRefSchema), async (c) => {
        return c.json(ok(await ehService.getGalleryDetail(c.get("userId"), c.req.valid("param"))))
      })

      /** GET /api/eh/galleries/:gid/:token/comments，单独一次请求，不拖慢详情页首屏。 */
      .get("/galleries/:gid/:token/comments", apiValidator("param", galleryRefSchema), async (c) => {
        return c.json(ok(await ehService.getGalleryComments(c.get("userId"), c.req.valid("param"))))
      })

      /** GET /api/eh/galleries/:gid/:token/pages/:page/image，流式转发大图。 */
      .get("/galleries/:gid/:token/pages/:page/image", apiValidator("param", pageParamSchema), async (c) => {
        const { gid, token, page } = c.req.valid("param")
        const image = await ehService.openGalleryImage(c.get("userId"), { gid, token }, page)
        return streamImage(image)
      })

      /** GET /api/eh/thumbnail?u=&s=，只接受本服务签发过的地址。 */
      .get("/thumbnail", apiValidator("query", thumbnailQuerySchema), async (c) => {
        const { u, s } = c.req.valid("query")
        return streamImage(await ehService.openThumbnail(c.get("userId"), u, s))
      })

      /** POST /api/eh/progress，记下读到第几页。 */
      .post("/progress", apiValidator("json", pageParamSchema), async (c) => {
        const { gid, token, page } = c.req.valid("json")
        await ehService.saveProgress(c.get("userId"), { gid, token }, page)
        return c.json(ok(null))
      })
  )
}

/** 流式转发，不把整张图读进内存。 */
function streamImage({ body, contentType, contentLength }: ImageStream): Response {
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": IMAGE_CACHE_CONTROL })
  if (contentLength) {
    headers.set("Content-Length", contentLength)
  }
  return new Response(body, { headers })
}
