import { Module } from "@nestjs/common"

import { HolidayController } from "@/holiday/holiday.controller.js"
import { HolidayService } from "@/holiday/holiday.service.js"
import { HolidaySource } from "@/holiday/holiday.source.js"

@Module({
  controllers: [HolidayController],
  providers: [HolidayService, HolidaySource],
})
export class HolidayModule {}
