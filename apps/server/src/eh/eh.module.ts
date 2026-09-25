import { Module } from "@nestjs/common"

import { AttachmentUrls } from "@/eh/attachment-urls"
import { CredentialController } from "@/eh/credential.controller"
import { CredentialService } from "@/eh/credential.service"
import { GalleryCatalog } from "@/eh/gallery-catalog"
import { GalleryController } from "@/eh/gallery.controller"
import { GalleryService } from "@/eh/gallery.service"
import { ImageLocator } from "@/eh/image-locator"
import { ImageController } from "@/eh/image.controller"
import { ImageService } from "@/eh/image.service"
import { PreferencesController } from "@/eh/preferences.controller"
import { PreferencesService } from "@/eh/preferences.service"
import { ReadingController } from "@/eh/reading.controller"
import { ReadingService } from "@/eh/reading.service"
import { TagTranslationController } from "@/eh/tag-translation.controller"
import { TagTranslationService } from "@/eh/tag-translation.service"
import { TagTranslationSource } from "@/eh/tag-translation.source"
import { EhClient } from "@/eh/upstream/eh-client"
import { OutboundModule } from "@/outbound/outbound.module"
import { SigningModule } from "@/signing/signing.module"

/** 图集浏览。与 e 站打交道的细节（出网、解析、上游失败识别）都在 upstream/ 下，不越出这个模块。 */
@Module({
  imports: [OutboundModule, SigningModule],
  controllers: [
    CredentialController,
    PreferencesController,
    GalleryController,
    ImageController,
    ReadingController,
    TagTranslationController,
  ],
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
    TagTranslationService,
    TagTranslationSource,
  ],
})
export class EhModule {}
