import { Module } from "@nestjs/common"

import { AttachmentUrls } from "@/eh/attachment-urls.js"
import { CredentialController } from "@/eh/credential.controller.js"
import { CredentialService } from "@/eh/credential.service.js"
import { GalleryCatalog } from "@/eh/gallery-catalog.js"
import { GalleryController } from "@/eh/gallery.controller.js"
import { GalleryService } from "@/eh/gallery.service.js"
import { ImageLocator } from "@/eh/image-locator.js"
import { ImageController } from "@/eh/image.controller.js"
import { ImageService } from "@/eh/image.service.js"
import { PreferencesController } from "@/eh/preferences.controller.js"
import { PreferencesService } from "@/eh/preferences.service.js"
import { ReadingController } from "@/eh/reading.controller.js"
import { ReadingService } from "@/eh/reading.service.js"
import { EhClient } from "@/eh/upstream/eh-client.js"

/** 图集浏览。与 e 站打交道的细节（出网、解析、上游失败识别）都在 upstream/ 下，不越出这个模块。 */
@Module({
  controllers: [CredentialController, PreferencesController, GalleryController, ImageController, ReadingController],
  providers: [
    AttachmentUrls,
    CredentialService,
    EhClient,
    GalleryCatalog,
    GalleryService,
    ImageLocator,
    ImageService,
    PreferencesService,
    ReadingService,
  ],
})
export class EhModule {}
