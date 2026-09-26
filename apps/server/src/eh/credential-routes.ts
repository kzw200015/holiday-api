import { Hono } from "hono"
import { z } from "zod"

import { signedIn } from "@server/auth/session"
import * as credentialService from "@server/eh/credential-service"
import { validate } from "@server/validate"

const COOKIE_CHARS = "Cookie 值里有不允许的字符，检查是不是多复制了分号、空格或引号"

/* RFC 6265 的 cookie-octet：可见 ASCII，去掉空格、双引号、逗号、分号和反斜杠。这三个值会被原样拼进 Cookie 请求头 */
const cookieValue = z
  .string({ error: COOKIE_CHARS })
  .regex(/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/, COOKIE_CHARS)

const REQUIRED_COOKIES = "ipb_member_id 和 ipb_pass_hash 都不能为空"

/** e 站凭据的绑定状态、绑定与解绑。都由服务端给出结果状态，前端直接用。 */
export const credentialRoutes = new Hono()
  .get("/", signedIn, async (c) => c.json(await credentialService.status(c.get("userId"))))
  /*
   * 绑定用户从浏览器复制出来的三个 Cookie。让人手动粘贴而不是代填账号密码：
   * 论坛的登录接口挂在 Cloudflare 盾后面，服务端直接 POST 会被 challenge 拦掉
   */
  .post(
    "/",
    signedIn,
    validate(
      "json",
      z.object({
        ipbMemberId: cookieValue.min(1, REQUIRED_COOKIES),
        ipbPassHash: cookieValue.min(1, REQUIRED_COOKIES),
        /* 里站专用，留空则只能看表站 */
        igneous: cookieValue.default(""),
      }),
    ),
    async (c) => c.json(await credentialService.bind(c.get("userId"), c.req.valid("json"))),
  )
  .delete("/", signedIn, async (c) => c.json(await credentialService.unbind(c.get("userId"))))
