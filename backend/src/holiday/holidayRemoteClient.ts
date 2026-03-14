/** 远程 JSON 中单日快照 */
export interface HolidayDaySnapshot {
  name: string;
  date: string;
  isOffDay: boolean;
}

/** 远程 JSON 响应结构 */
interface HolidayYearResponse {
  days: HolidayDaySnapshot[];
}

const BASE_URL =
  "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master";

/** 从 GitHub 拉取指定年份的节假日数据 */
export async function fetchYearDays(
  year: number
): Promise<HolidayDaySnapshot[]> {
  const url = `${BASE_URL}/${year}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`拉取 ${year} 年节假日数据失败: ${response.status}`);
  }
  const data = (await response.json()) as HolidayYearResponse;
  // 校验远程响应结构
  if (!Array.isArray(data.days)) {
    throw new Error(`${year} 年节假日数据格式异常: 缺少 days 数组`);
  }
  return data.days;
}
