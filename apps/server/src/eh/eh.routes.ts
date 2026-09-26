import { Elysia } from "elysia"

import type { Tokens } from "@server/auth/tokens"
import type { Database } from "@server/database/connection"
import { AttachmentUrls } from "@server/eh/attachment-urls"
import { credentialRoutes } from "@server/eh/credential.routes"
import { CredentialService } from "@server/eh/credential.service"
import { GalleryCatalog } from "@server/eh/gallery-catalog"
import { galleryRoutes } from "@server/eh/gallery.routes"
import { GalleryService } from "@server/eh/gallery.service"
import { ImageLocator } from "@server/eh/image-locator"
import { imageRoutes } from "@server/eh/image.routes"
import { ImageService } from "@server/eh/image.service"
import { preferencesRoutes } from "@server/eh/preferences.routes"
import { PreferencesService } from "@server/eh/preferences.service"
import { readingRoutes } from "@server/eh/reading.routes"
import { ReadingService } from "@server/eh/reading.service"
import { tagTranslationRoutes } from "@server/eh/tag-translation.routes"
import { TagTranslationService } from "@server/eh/tag-translation.service"
import { TagTranslationSource } from "@server/eh/tag-translation.source"
import { EhClient } from "@server/eh/upstream/eh-client"
import type { Outbound } from "@server/outbound"

export interface EhDependencies {
  database: Database
  outbound: Outbound
  tokens: Tokens
  /** 图片地址的签名子密钥 */
  attachmentKey: Buffer
  /** 签出的图片地址的有效期（毫秒） */
  attachmentTtl: number
}

/**
 * 图集浏览。与 e 站打交道的细节（出网、解析、上游失败识别）都在 upstream/ 下，不越出这个模块。
 * 各服务在这里装配一次、整个进程共用：元数据、分片、译名的缓存都挂在它们身上。
 */
export function ehRoutes({ database, outbound, tokens, attachmentKey, attachmentTtl }: EhDependencies) {
  const ehClient = new EhClient(outbound)
  const attachmentUrls = new AttachmentUrls(attachmentKey, attachmentTtl)
  const credentialService = new CredentialService(database, ehClient)
  const tagTranslationService = new TagTranslationService(database, new TagTranslationSource(outbound))
  const galleryCatalog = new GalleryCatalog(ehClient, attachmentUrls, tagTranslationService)
  const imageLocator = new ImageLocator(ehClient)
  return new Elysia({ prefix: "/eh" })
    .use(imageRoutes(new ImageService(attachmentUrls, credentialService, imageLocator, ehClient)))
    .use(credentialRoutes(credentialService, tokens))
    .use(preferencesRoutes(new PreferencesService(database), tokens))
    .use(
      galleryRoutes(
        new GalleryService(ehClient, credentialService, galleryCatalog, imageLocator, attachmentUrls),
        tokens,
      ),
    )
    .use(readingRoutes(new ReadingService(database, galleryCatalog), tokens))
    .use(tagTranslationRoutes(tagTranslationService, tokens))
}
