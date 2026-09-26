import { ehCookieSchema } from "@myapi/shared/eh"
import { Elysia } from "elysia"

import { signedIn } from "@server/auth/session"
import * as credentialService from "@server/eh/credential.service"

/** e 站凭据的绑定状态、绑定与解绑。都由服务端给出结果状态，前端直接用。 */
export const credentialRoutes = new Elysia({ prefix: "/credential" })
  .use(signedIn)
  .get("/", ({ userId }) => credentialService.status(userId))
  .post("/", ({ userId, body }) => credentialService.bind(userId, body), { body: ehCookieSchema })
  .delete("/", ({ userId }) => credentialService.unbind(userId))
