/** 出网请求里用得到的那几项。 */
export interface OutboundInit {
  method?: "GET" | "POST"
  headers?: Record<string, string>
  body?: string
}

/**
 * 出网：本进程访问外部网站（e 站、图床、节假日数据源）的唯一出口，形状就是 fetch。
 *
 * 由应用装配时交给用得到的领域，是测试换掉外部网站的唯一接缝：测试里换成按请求回放内存响应、并记下每个请求的实现。
 * 响应一律不跟随重定向，调用方自己看 3xx：里站 Cookie 无效时会 302 回表站，跟随的话会拿到一个「看起来正常」的表站页面；
 * 图床若被诱导 302 到内网，跟随就等于绕过了图片主机白名单。
 */
export type Outbound = (url: string, init?: OutboundInit) => Promise<Response>

/**
 * 真实的出网：Bun 的 fetch，请求超时由这里用 AbortController 自己计。
 *
 * 超时分两段：等响应头最多 timeout；之后按「多久没收到一个字节」算，是两次数据之间的间隔，不是总时长。
 * 图片是边读边转发给浏览器的，按总时长算的话，弱网下一张大图传到一半就被掐断。
 * 空闲只在调用方来读时计时：浏览器那头读得慢、这边没去要数据，不算上游空闲。
 * 不用 Bun fetch 自带的 timeout 选项：它按套接字算空闲（浏览器读得慢也算上游空闲），而且按 4 秒一档取整、还可能多出两档。
 * 那道套接字空闲超时默认 5 分钟、照样叠在外面，所以 EH_REQUEST_TIMEOUT 配得比 5 分钟长也不会生效。
 *
 * 连接阶段另有一道更早的超时，交给 Bun 的 fetch：连不上时约 10 秒放弃，已连上的慢响应不受影响（1.4.2 实测，文档未写明，
 * 升级 Bun 后要复核）。图床节点是志愿者的机器，下线时多半连不上，比请求超时更早放弃才好换一台节点重试。
 */
export function createOutbound(userAgent: string, timeout: number): Outbound {
  return async (url, init = {}) => {
    const controller = new AbortController()
    const headersTimer = setTimeout(() => controller.abort(new Error(`等响应头超过 ${timeout}ms`)), timeout)
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: { "user-agent": userAgent, ...init.headers },
        redirect: "manual",
        signal: controller.signal,
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
    const wrapped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
    /* 新建的 Response 没有 url，报错时要用它指明是哪个地址 */
    Object.defineProperty(wrapped, "url", { value: response.url })
    return wrapped
  }
}
