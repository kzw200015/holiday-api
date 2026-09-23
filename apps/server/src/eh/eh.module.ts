import { Module } from "@nestjs/common"

import { AttachmentUrls } from "./attachment-urls.js"
import { CredentialController } from "./credential.controller.js"
import { CredentialService } from "./credential.service.js"
import { GalleryCatalog } from "./gallery-catalog.js"
import { GalleryController } from "./gallery.controller.js"
import { GalleryService } from "./gallery.service.js"
import { ImageLocator } from "./image-locator.js"
import { ImageController } from "./image.controller.js"
import { ImageService } from "./image.service.js"
import { PreferencesController } from "./preferences.controller.js"
import { PreferencesService } from "./preferences.service.js"
import { ReadingController } from "./reading.controller.js"
import { ReadingService } from "./reading.service.js"
import { EhClient } from "./upstream/eh-client.js"

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
