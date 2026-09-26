import { ehCookieSchema } from "@myapi/shared/eh"
import { Elysia } from "elysia"

import { signedIn } from "@server/auth/session"
import type { Tokens } from "@server/auth/tokens"
import type { CredentialService } from "@server/eh/credential.service"

/** e 站凭据的绑定状态、绑定与解绑。都由服务端给出结果状态，前端直接用。 */
export function credentialRoutes(credentialService: CredentialService, tokens: Tokens) {
  return new Elysia({ prefix: "/credential" })
    .use(signedIn(tokens))
    .get("/", ({ userId }) => credentialService.status(userId))
    .post("/", ({ userId, body }) => credentialService.bind(userId, body), { body: ehCookieSchema })
    .delete("/", ({ userId }) => credentialService.unbind(userId))
}
