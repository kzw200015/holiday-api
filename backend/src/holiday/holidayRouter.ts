import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { Hono } from "hono";
import { ok, badRequest } from "@myapi/shared/apiResponse";
import { isHoliday, queryNextOffDay } from "./holidayService.js";

dayjs.extend(customParseFormat);

/** 解析并校验日期参数，未传则默认今天，格式错误返回 null */
function parseDateParam(dateStr: string | undefined): dayjs.Dayjs | null {
  if (!dateStr) {
    return dayjs();
  }
  // strict 模式确保 2024-02-31 等非法日期被拒绝
  const parsed = dayjs(dateStr, "YYYY-MM-DD", true);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed;
}

const holidayRouter = new Hono();

/** GET /is-holiday?date=YYYY-MM-DD */
holidayRouter.get("/is-holiday", async (c) => {
  const dateStr = c.req.query("date");
  const date = parseDateParam(dateStr);
  if (!date) {
    return c.json(badRequest("日期格式错误，应为 YYYY-MM-DD"), 400);
  }
  const result = await isHoliday(date);
  return c.json(ok(result));
});

/** GET /next-off-day?date=YYYY-MM-DD */
holidayRouter.get("/next-off-day", async (c) => {
  const dateStr = c.req.query("date");
  const date = parseDateParam(dateStr);
  if (!date) {
    return c.json(badRequest("日期格式错误，应为 YYYY-MM-DD"), 400);
  }
  const result = await queryNextOffDay(date);
  return c.json(ok(result));
});

export { holidayRouter };
