import { Elysia } from "elysia"

import { credentialRoutes } from "@server/eh/credential.routes"
import { galleryRoutes } from "@server/eh/gallery.routes"
import { imageRoutes } from "@server/eh/image.routes"
import { preferencesRoutes } from "@server/eh/preferences.routes"
import { readingRoutes } from "@server/eh/reading.routes"
import { tagTranslationRoutes } from "@server/eh/tag-translation.routes"

/** 图集浏览。与 e 站打交道的细节（出网、解析、上游失败识别）都在 upstream/ 下，不越出这个模块。 */
export const ehRoutes = new Elysia({ prefix: "/eh" })
  .use(imageRoutes)
  .use(credentialRoutes)
  .use(preferencesRoutes)
  .use(galleryRoutes)
  .use(readingRoutes)
  .use(tagTranslationRoutes)
