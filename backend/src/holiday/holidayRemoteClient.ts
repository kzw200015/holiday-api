import { z } from "zod"
import { holidayYearResponseSchema, type HolidayDay } from "./holidayModels"

/** 节假日数据源的基础地址。 */
const REMOTE_BASE_URL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"

/** 单次拉取的总超时，覆盖原来 30 秒连接 + 30 秒读取的上限。 */
const REMOTE_TIMEOUT_MS = 60_000

/**
 * 从远程数据源（holiday-cn 仓库）拉取节假日数据。
 * 数据源把 .json 文件按 text/plain 返回，fetch 的 json() 不看 Content-Type，无需特殊处理。
 */
export class HolidayRemoteClient {
  /** 拉取指定年份的节假日数据。 */
  async fetchYearDays(year: number): Promise<HolidayDay[]> {
    // 网络错误、超时、响应体不是 JSON 都归为"拉取失败"，原始错误挂在 cause 上
    const wrapFailure = (cause: unknown): never => {
      throw new Error(`拉取 ${year} 年节假日数据失败`, { cause })
    }
    const response = await fetch(`${REMOTE_BASE_URL}/${year}.json`, {
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    }).catch(wrapFailure)
    if (!response.ok) {
      throw new Error(`拉取 ${year} 年节假日数据失败: HTTP ${response.status}`)
    }
    const payload: unknown = await response.json().catch(wrapFailure)

    // 校验远程响应结构，避免脏数据入库
    const parsed = holidayYearResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`${year} 年节假日数据格式异常: ${z.prettifyError(parsed.error)}`)
    }
    return parsed.data.days
  }
}
