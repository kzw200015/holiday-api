import { Hono } from "hono"
import { z } from "zod"
import type { JwtAuth, SessionEnv } from "../auth/jwtAuth"
import { badRequest, ok } from "../apiresponse/apiResponse"
import { apiValidator } from "../web/apiValidator"
import type { AccessLogEnv } from "../web/requestLogger"
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

export type EhControllerService = Pick<
  EhService,
  | "getCredentialStatus"
  | "bindCredential"
  | "unbindCredential"
  | "searchGalleries"
  | "getGalleryDetail"
  | "getGalleryComments"
  | "saveProgress"
>

export type EhImageControllerService = Pick<EhService, "openGalleryImage" | "openThumbnail">

/**
 * 两个图片接口，同样挂在 /api/eh 下，但**不要求登录**。
 *
 * <img src> 是浏览器自己发的请求，带不了 Authorization 头也就拿不到 JWT，
 * 所以这两个接口靠地址里的签名认身份：签名由 service 签发，覆盖「这是哪一份附件、给谁看、什么时候过期」。
 * 它们也是统一 ApiResponse 契约的唯一例外，直接返回二进制流。
 *
 * 单独一个控制器而不是在 EhController 里挑几条路由豁免，是因为「哪些接口不需要登录」
 * 必须一眼看得出来：混在一起的话，日后加接口时很容易顺手加到不设防的那一侧。
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
      apiValidator("param", pageParamSchema),
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

/**
 * e 站相关的 HTTP 接口，挂载在 /api/eh 下。
 *
 * 整个子路由都要求登录：鉴权挂在这里而不是 app.use("/api/*")，
 * 因为 GET /api/holiday/is-holiday 有外部调用方，挂全局会把它一起挡掉。
 */
export class EhController extends Hono<SessionEnv> {
  constructor({ ehService, jwtAuth }: { ehService: EhControllerService; jwtAuth: JwtAuth }) {
    super()
    this.use("*", jwtAuth.middleware)

    /** GET /api/eh/credential，返回绑定状态，不含明文 Cookie。 */
    this.get("/credential", async (c) => {
      return c.json(ok(await ehService.getCredentialStatus(c.get("userId"))))
    })

    /** POST /api/eh/credential，绑定前先拿这组 Cookie 实际请求一次，无效直接 400。 */
    this.post("/credential", apiValidator("json", ehCookieSchema), async (c) => {
      const result = await ehService.bindCredential(c.get("userId"), c.req.valid("json"))
      return result.ok ? c.json(ok(result.status)) : c.json(badRequest(result.msg), 400)
    })

    /** POST /api/eh/credential/unbind，解绑后退回匿名浏览前站。 */
    this.post("/credential/unbind", async (c) => {
      await ehService.unbindCredential(c.get("userId"))
      return c.json(ok(null))
    })

    /** GET /api/eh/galleries?keyword=&categories=&cursor=，游标式分页。 */
    this.get("/galleries", apiValidator("query", searchQuerySchema), async (c) => {
      return c.json(ok(await ehService.searchGalleries(c.get("userId"), c.req.valid("query"))))
    })

    /** GET /api/eh/galleries/:gid/:token，元数据、阅读进度，外加这本图集的大图地址模板。 */
    this.get("/galleries/:gid/:token", apiValidator("param", galleryRefSchema), async (c) => {
      return c.json(ok(await ehService.getGalleryDetail(c.get("userId"), c.req.valid("param"))))
    })

    /** GET /api/eh/galleries/:gid/:token/comments，单独一次请求，不拖慢详情页首屏。 */
    this.get("/galleries/:gid/:token/comments", apiValidator("param", galleryRefSchema), async (c) => {
      return c.json(ok(await ehService.getGalleryComments(c.get("userId"), c.req.valid("param"))))
    })

    /** POST /api/eh/progress，记下读到第几页。 */
    this.post("/progress", apiValidator("json", pageParamSchema), async (c) => {
      const { gid, token, page } = c.req.valid("json")
      await ehService.saveProgress(c.get("userId"), { gid, token }, page)
      return c.json(ok(null))
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
