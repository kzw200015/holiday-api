import { Hono } from "hono"

import { credentialRoutes } from "@server/eh/credential-routes"
import { galleryRoutes } from "@server/eh/gallery-routes"
import { imageRoutes } from "@server/eh/image-routes"
import { preferencesRoutes } from "@server/eh/preferences-routes"
import { readingRoutes } from "@server/eh/reading-routes"
import { tagTranslationRoutes } from "@server/eh/tag-translation-routes"

/** 图集浏览。与 e 站打交道的细节（出网、解析、上游失败识别）都在 upstream/ 下，不越出这个模块。 */
export const ehRoutes = new Hono()
  .route("/", imageRoutes)
  .route("/credential", credentialRoutes)
  .route("/", preferencesRoutes)
  .route("/galleries", galleryRoutes)
  .route("/", readingRoutes)
  .route("/tag-translations", tagTranslationRoutes)
