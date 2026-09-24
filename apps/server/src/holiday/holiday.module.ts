import { Module } from "@nestjs/common"

import { HolidayController } from "@/holiday/holiday.controller"
import { HolidayService } from "@/holiday/holiday.service"
import { HolidaySource } from "@/holiday/holiday.source"

@Module({
  controllers: [HolidayController],
  providers: [HolidayService, HolidaySource],
})
export class HolidayModule {}
