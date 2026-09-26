import { createServer, type RequestListener, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"

import { createOutbound } from "@server/outbound-fetch"

/*
 * 真实的出网实现对着本机的 HTTP 服务：主接缝把出网整个换掉了，这几条网络语义只能在这里验证。
 */

let server: Server | undefined

async function serve(handler: RequestListener): Promise<string> {
  const current = createServer(handler)
  server = current
  await new Promise<void>((resolve) => current.listen(0, "127.0.0.1", resolve))
  return `http://127.0.0.1:${(current.address() as AddressInfo).port}`
}

afterEach(async () => {
  server?.closeAllConnections()
  await new Promise((resolve) => server?.close(resolve))
  server = undefined
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("出网", () => {
  it("不跟随重定向，白名单主机没法把请求引到别处；统一带上 User-Agent", async () => {
    const hits: string[] = []
    const base = await serve((request, response) => {
      hits.push(`${request.url} ${request.headers["user-agent"]}`)
      if (request.url === "/image") {
        response.writeHead(302, { location: "/internal" }).end()
      } else {
        response.end("internal")
      }
    })
    const response = await createOutbound("test-agent", 1000)(`${base}/image`)
    expect(response.status).toBe(302)
    await response.body?.cancel()
    expect(hits).toEqual(["/image test-agent"])
  })

  it("超时按空闲时间算：慢慢传、总时长超过超时也照样读完", async () => {
    const base = await serve(async (_request, response) => {
      response.writeHead(200, { "content-type": "image/jpeg" })
      for (let chunk = 0; chunk < 6; chunk += 1) {
        response.write("x")
        await sleep(100)
      }
      response.end()
    })
    const response = await createOutbound("test-agent", 300)(`${base}/`)
    expect(await response.text()).toBe("xxxxxx")
  })

  it("头发出来之后一直没有字节进来就超时", async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200, { "content-type": "image/jpeg" })
      response.write("x")
    })
    const response = await createOutbound("test-agent", 200)(`${base}/`)
    await expect(response.arrayBuffer()).rejects.toThrow("没收到数据")
  })

  it("迟迟不回响应头就超时", async () => {
    const base = await serve(() => undefined)
    await expect(createOutbound("test-agent", 200)(`${base}/`)).rejects.toThrow("等响应头超过")
  })

  it("传到一半连接断了，读响应体会失败，而不是当成读完", async () => {
    const base = await serve((request, response) => {
      response.writeHead(200, { "content-type": "image/jpeg", "content-length": "1000" })
      response.write("x".repeat(100), () => request.socket.destroy())
    })
    const response = await createOutbound("test-agent", 1000)(`${base}/`)
    await expect(response.arrayBuffer()).rejects.toThrow("socket connection was closed")
  })
})
