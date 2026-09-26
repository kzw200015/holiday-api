import { Hono } from "hono"

import { signedIn } from "@server/auth/session"
import * as tagTranslationService from "@server/eh/tag-translation-service"

/** 标签译名的同步状态与手动同步。译名是全站共用的，任何登录的本站账号都能同步（见 ADR-0005）。 */
export const tagTranslationRoutes = new Hono()
  .get("/", signedIn, async (c) => c.json(await tagTranslationService.status()))
  /* 拉取与写入都完成才回，可能要十几秒；回的是同步后的状态 */
  .post("/sync", signedIn, async (c) => c.json(await tagTranslationService.sync()))
