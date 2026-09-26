import { env } from "@server/config"
import { createOutbound, type Outbound } from "@server/outbound-fetch"

/**
 * 本进程的出网，访问外部网站都经它。所有出网请求共用同一个 User-Agent 与超时配置。
 * 用 let 导出：ES 模块的导出是活绑定，replaceOutbound 换掉之后，各处 import 进来的 outbound 跟着变。
 */
export let outbound: Outbound = createOutbound(env.EH_USER_AGENT, env.EH_REQUEST_TIMEOUT)

/**
 * 换掉出网的实现：测试换掉外部网站的唯一接缝，在起应用之前换成按请求回放内存响应、并记下每个请求的实现。
 * 业务代码不调它。
 */
export function replaceOutbound(replacement: Outbound) {
  outbound = replacement
}
