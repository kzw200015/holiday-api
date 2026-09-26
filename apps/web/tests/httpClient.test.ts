/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, hasToken, onUnauthorized, request, requestWithin, setToken } from "@/shared/api/httpClient"
import { hanging, present } from "./support"

/* Eden 按 fetch(地址, 选项) 调用 */
const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()

beforeEach(() => {
  setToken("")
  onUnauthorized(vi.fn())
  fetch.mockReset()
  vi.stubGlobal("fetch", fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** 第 index 次请求的地址与选项 */
function call(index: number) {
  const [url, init] = present(fetch.mock.calls[index], `第 ${index + 1} 次请求`)
  return { url: new URL(url), init, headers: new Headers(init.headers) }
}

const failure = (status: number, message: string | string[]) =>
  Response.json({ statusCode: status, message, error: "Bad Request" }, { status })

describe("HTTP 边界", () => {
  it("带上查询参数、鉴权头和 JSON 请求体", async () => {
    fetch.mockImplementation(async () => Response.json({ id: 1 }))
    setToken("current")

    expect(await request(api.holiday.detail.get({ query: { date: "2026-01-01" } }))).toEqual({ id: 1 })
    const get = call(0)
    expect(get.init.method).toBe("GET")
    expect(get.url.pathname).toBe("/api/holiday/detail")
    expect(get.url.searchParams.get("date")).toBe("2026-01-01")
    expect(get.headers.get("Authorization")).toBe("Bearer current")

    await request(api.eh["search-history"].post({ keyword: "中文 & cat" }))
    const post = call(1)
    expect(post.init.method).toBe("POST")
    expect(post.headers.get("Content-Type")).toBe("application/json")
    expect(JSON.parse(String(post.init.body))).toEqual({ keyword: "中文 & cat" })

    await request(api.eh.history({ gid: 27 }).delete())
    const remove = call(2)
    expect(remove.init.method).toBe("DELETE")
    expect(remove.url.pathname).toBe("/api/eh/history/27")
    expect(remove.init.body).toBeUndefined()
  })

  it("没登录时不带鉴权头", async () => {
    fetch.mockImplementation(async () => new Response(null))
    await request(api.auth.me.get())
    expect(call(0).headers.has("Authorization")).toBe(false)
  })

  it("响应体就是业务数据；空体交出 null", async () => {
    fetch
      .mockImplementationOnce(async () => Response.json({ id: 1, username: "a" }))
      .mockImplementation(async () => new Response(null))
    expect(await request(api.auth.me.get())).toEqual({ id: 1, username: "a" })
    expect(await request(api.eh.history.delete())).toBeNull()
    expect(await request(api.auth.me.get())).toBeNull()
  })

  it("像日期的字符串原样交出，不转成 Date", async () => {
    fetch.mockImplementation(async () => Response.json({ date: "2026-01-01", isOffDay: true, name: "元旦" }))
    expect((await request(api.holiday.detail.get({ query: { date: "2026-01-01" } }))).date).toBe("2026-01-01")
  })

  it("校验失败时的一组文案连成一句", async () => {
    fetch.mockImplementation(async () => failure(400, ["页码不合法", "上报方标识不合法"]))
    await expect(request(api.eh.history.delete())).rejects.toThrow(new Error("页码不合法；上报方标识不合法"))
  })

  it("当前令牌失效时清理会话，并使用后端错误文案", async () => {
    const unauthorized = vi.fn()
    onUnauthorized(unauthorized)
    setToken("expired")
    fetch.mockImplementation(async () => failure(401, "请先登录"))
    await expect(request(api.eh.credential.get())).rejects.toThrow("请先登录")
    expect(call(0).headers.get("Authorization")).toBe("Bearer expired")
    expect(hasToken()).toBe(false)
    expect(unauthorized).toHaveBeenCalledOnce()
  })

  it("旧令牌的迟到 401 不能退出新登录的账号", async () => {
    const unauthorized = vi.fn()
    onUnauthorized(unauthorized)
    setToken("old")
    let fail: (() => void) | undefined
    fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          fail = () => resolve(failure(401, "已过期"))
        }),
    )
    const pending = request(api.eh.credential.get())
    await vi.waitFor(() => expect(fail).toBeDefined())
    setToken("new")
    present(fail, "让请求失败的回调")()
    await expect(pending).rejects.toThrow("已过期")
    expect(hasToken()).toBe(true)
    expect(unauthorized).not.toHaveBeenCalled()
  })

  it("取消请求原样抛出取消", async () => {
    const controller = new AbortController()
    fetch.mockImplementation(hanging)
    const pending = request(api.holiday.detail.get({ query: { date: "" }, fetch: { signal: controller.signal } }))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("带时限的请求到点就中止，报请求超时", async () => {
    vi.useFakeTimers()
    fetch.mockImplementation(hanging)
    const outcome = requestWithin(1000, (signal) => api.eh.history.delete(undefined, { fetch: { signal } })).then(
      () => "成功",
      (error: Error) => error.message,
    )
    await vi.advanceTimersByTimeAsync(1000)
    expect(await outcome).toBe("请求超时")
  })

  /* 没有本站响应体的失败：换成界面能直接显示的说明。 */
  it.each([
    { label: "断网", respond: () => Promise.reject(new TypeError("Failed to fetch")), message: "网络连接失败" },
    {
      label: "反向代理回 HTML",
      respond: async () =>
        new Response("<html>Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } }),
      message: "服务器返回了 HTTP 502",
    },
    { label: "空响应体", respond: async () => new Response(null, { status: 504 }), message: "服务器返回了 HTTP 504" },
  ])("$label时给出中文说明", async ({ respond, message }) => {
    fetch.mockImplementation(respond)
    await expect(request(api.holiday.detail.get({ query: { date: "" } }))).rejects.toThrow(new Error(message))
  })
})
