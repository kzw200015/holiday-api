import type { Outbound } from "@server/outbound-fetch"

/** 发往外部网站的一次请求。 */
export interface RecordedRequest {
  url: URL
}

/** 按请求给出响应；给不出（返回 undefined）就当作测试没配这个请求，回 unconfigured()。 */
export type Responder = (request: RecordedRequest) => Response | undefined | Promise<Response | undefined>

/** 测试没给出响应的请求：599 不是哪个真实网站会回的状态码，一眼认得出是测试漏配了。 */
export const unconfigured = () => new Response("未配置的请求", { status: 599 })

/**
 * 假的外部网站：替换掉真实的出网，按请求回放内存里的响应。
 * 请求照样走完服务端的整条链路（拼地址、认状态码、校验数据），只在出网这一步换掉。
 */
export class FakeOutbound {
  respond: Responder

  constructor(respond: Responder = unconfigured) {
    this.respond = respond
  }

  readonly fetch: Outbound = async (url: string) => (await this.respond({ url: new URL(url) })) ?? unconfigured()
}

export function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } })
}

/** holiday-cn 数据源：只有 2026 年有数据，其余年份的文件还没建出来（404）。2026-01-04 是调休上班的周日。 */
export function holidaySource(request: RecordedRequest): Response | undefined {
  /* 只认 holiday-cn 仓库下的文件，别的请求算测试没配 */
  if (
    request.url.host !== "raw.githubusercontent.com" ||
    !request.url.pathname.startsWith("/NateScarlet/holiday-cn/")
  ) {
    return undefined
  }
  if (request.url.pathname.endsWith("/2026.json")) {
    const days = [
      { name: "元旦", date: "2026-01-01", isOffDay: true },
      { name: "元旦", date: "2026-01-04", isOffDay: false },
    ]
    /* 数据源把 .json 按 text/plain 返回 */
    return new Response(JSON.stringify({ days }), { headers: { "content-type": "text/plain; charset=utf-8" } })
  }
  return new Response("404: Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } })
}
