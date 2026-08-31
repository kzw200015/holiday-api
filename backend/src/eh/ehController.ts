import { Hono } from "hono"
import { z } from "zod"
import type { JwtAuth, SessionEnv } from "../auth/jwtAuth"
import { badRequest, ok } from "../web/apiResponse"
import { apiValidator } from "../web/apiValidator"
import { CATEGORY_NAMES } from "./ehCategory"
import { ehCookieSchema, galleryPageSchema, galleryRefSchema } from "./ehModels"
import type { EhService } from "./ehService"

/**
 * 搜索参数。分类用名字的逗号列表传，位掩码的换算封在 ehCategory 里：
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

/**
 * e 站相关的 HTTP 接口，挂载在 /api/eh 下。
 *
 * 整个子路由都要求登录：鉴权挂在这里而不是 app.use("/api/*")，
 * 因为 GET /api/holiday/is-holiday 有外部调用方，挂全局会把它一起挡掉。
 * 不需要登录的那两个图片接口在 ehImageController.ts，单独一个类。
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
    this.post("/progress", apiValidator("json", galleryPageSchema), async (c) => {
      const { gid, token, page } = c.req.valid("json")
      await ehService.saveProgress(c.get("userId"), { gid, token }, page)
      return c.json(ok(null))
    })
  }
}
