import { env } from "@server/config"

/**
 * 出网：本进程访问外部网站（节假日数据源）的唯一出口，形状就是只收地址的 fetch。
 *
 * 响应一律不跟随重定向，调用方自己看 3xx：数据源的地址是写死的，被重定向说明它换了地方，该改代码而不是跟过去。
 */
export type Outbound = (url: string) => Promise<Response>

/**
 * 本进程的出网。用 let 导出：ES 模块的导出是活绑定，replaceOutbound 换掉之后，各处 import 进来的 outbound 跟着变。
 */
export let outbound: Outbound = fetchWithTimeouts

/**
 * 换掉出网的实现：测试换掉外部网站的唯一接缝，在起应用之前换成按请求回放内存响应的实现。
 * 业务代码不调它。
 */
export function replaceOutbound(replacement: Outbound) {
  outbound = replacement
}

/**
 * 真实的出网：Bun 的 fetch，带上统一的 User-Agent，超时由这里用 AbortController 自己计。
 *
 * 超时分两段：等响应头最多 OUTBOUND_TIMEOUT；之后按「多久没收到一个字节」算，是两次数据之间的间隔，不是总时长。
 * Bun fetch 自带的套接字空闲超时（默认 5 分钟，按 4 秒一档取整）关掉，超时只由这里决定。
 *
 * 连接阶段另有一道更早的超时，交给 Bun 的 fetch：连不上时约 10 秒放弃，已连上的慢响应不受影响（1.4.2 实测，文档未写明，
 * 升级 Bun 后要复核）。代理照惯例读 HTTPS_PROXY（与 NO_PROXY），也交给 Bun 的 fetch。
 */
async function fetchWithTimeouts(url: string): Promise<Response> {
  const timeout = env.OUTBOUND_TIMEOUT
  const controller = new AbortController()
  const headersTimer = setTimeout(() => controller.abort(new Error(`等响应头超过 ${timeout}ms`)), timeout)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { "user-agent": env.OUTBOUND_USER_AGENT },
      redirect: "manual",
      signal: controller.signal,
      timeout: false,
    })
  } finally {
    clearTimeout(headersTimer)
  }
  if (response.body === null) {
    return response
  }
  const reader = response.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(stream) {
      /* 中止同一个 signal 会让上游的响应体读取失败，read() 随之抛出，这个流也就跟着出错 */
      const idleTimer = setTimeout(() => controller.abort(new Error(`超过 ${timeout}ms 没收到数据`)), timeout)
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          stream.close()
        } else {
          stream.enqueue(chunk.value)
        }
      } finally {
        clearTimeout(idleTimer)
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}
