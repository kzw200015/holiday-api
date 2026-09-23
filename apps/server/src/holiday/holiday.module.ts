import { Module } from "@nestjs/common"

import { HolidayController } from "./holiday.controller.js"
import { HolidayService } from "./holiday.service.js"
import { HolidaySource } from "./holiday.source.js"

@Module({
  controllers: [HolidayController],
  providers: [HolidayService, HolidaySource],
})
export class HolidayModule {}
