import { Module } from "@nestjs/common"

import { HolidayController } from "@/holiday/holiday.controller"
import { HolidayService } from "@/holiday/holiday.service"
import { HolidaySource } from "@/holiday/holiday.source"
import { OutboundModule } from "@/outbound/outbound.module"

@Module({
  imports: [OutboundModule],
  controllers: [HolidayController],
  providers: [HolidayService, HolidaySource],
})
export class HolidayModule {}
