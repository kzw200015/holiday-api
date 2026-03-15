import dayjs from "dayjs";
import { eq, like } from "drizzle-orm";
import type { NextOffDayResult } from "@packages/types/holiday";
import { db } from "@/db/client.js";
import { holidayDays } from "@/db/schema.js";
import { logger } from "@/logger.js";
import { fetchYearDays } from "@/holiday/holidayRemoteClient.js";

/** 判断指定日期是否为休息日：先查库，无记录则按周末判断 */
export async function isHoliday(date: dayjs.Dayjs): Promise<boolean> {
  const dateStr = date.format("YYYY-MM-DD");
  const rows = await db
    .select()
    .from(holidayDays)
    .where(eq(holidayDays.date, dateStr));

  if (rows.length > 0) {
    return rows[0].isOffDay;
  }
  // 无记录，按周末判断（0=周日, 6=周六）
  const day = date.day();
  return day === 0 || day === 6;
}

/** 从指定日期开始逐日查找下一个休息日 */
export async function queryNextOffDay(
  date: dayjs.Dayjs
): Promise<NextOffDayResult> {
  let current = date;
  let days = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await isHoliday(current)) {
      return {
        nextOffDayDate: current.format("YYYY-MM-DD"),
        daysToNextOffDay: days,
      };
    }
    current = current.add(1, "day");
    days++;
  }
}

/** 刷新指定年份的节假日数据：先删后插 */
async function refreshYearDays(year: number): Promise<void> {
  const remoteDays = await fetchYearDays(year);

  // 删除该年份的旧数据
  await db.delete(holidayDays).where(like(holidayDays.date, `${year}-%`));

  // 批量插入新数据
  if (remoteDays.length > 0) {
    await db.insert(holidayDays).values(
      remoteDays.map((d) => ({
        name: d.name,
        date: d.date,
        isOffDay: d.isOffDay,
      }))
    );
  }

  logger.info(`已刷新 ${year} 年节假日数据，共 ${remoteDays.length} 条`);
}

/** 启动时初始化当年和下一年的数据 */
export async function initCurrentAndNextYear(): Promise<void> {
  const currentYear = dayjs().year();
  await refreshYearDays(currentYear);
  await refreshYearDays(currentYear + 1);
}
