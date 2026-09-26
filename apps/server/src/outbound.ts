import { env } from "@server/config"
import { createOutbound, type Outbound } from "@server/outbound-fetch"

let current: Outbound = createOutbound(env.EH_USER_AGENT, env.EH_REQUEST_TIMEOUT)

/** 本进程的出网，访问外部网站都经它。所有出网请求共用同一个 User-Agent 与超时配置。 */
export const outbound: Outbound = (url, init) => current(url, init)

/**
 * 换掉出网的实现：测试换掉外部网站的唯一接缝，在起应用之前换成按请求回放内存响应、并记下每个请求的实现。
 * 业务代码不调它。
 */
export function replaceOutbound(replacement: Outbound) {
  current = replacement
}
