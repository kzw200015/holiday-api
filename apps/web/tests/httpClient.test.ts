import { AxiosError, CanceledError, type AxiosAdapter, type AxiosResponse } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { hasToken, httpClient, onUnauthorized, setToken } from "@/shared/api/httpClient"

beforeEach(() => {
  setToken("")
  onUnauthorized(vi.fn())
})

describe("HTTP 边界", () => {
  it("默认使用 fetch 适配器，保留查询参数、鉴权头和 JSON 请求体", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json({ id: 1 }))
    const config = { baseURL: "https://myapi.test/api", env: { fetch } }
    setToken("current")

    expect(await httpClient.get("/eh/galleries", { ...config, params: { keyword: "中文 & cat" } })).toEqual({ id: 1 })
    const getRequest = fetch.mock.calls[0]![0] as Request
    expect(getRequest.method).toBe("GET")
    expect(new URL(getRequest.url).pathname).toBe("/api/eh/galleries")
    expect(new URL(getRequest.url).searchParams.get("keyword")).toBe("中文 & cat")
    expect(getRequest.headers.get("Authorization")).toBe("Bearer current")

    expect(await httpClient.post("/eh/preferences/reader-interval", { interval: 6 }, config)).toEqual({ id: 1 })
    const postRequest = fetch.mock.calls[1]![0] as Request
    expect(postRequest.method).toBe("POST")
    expect(postRequest.headers.get("Content-Type")).toBe("application/json")
    expect(await postRequest.json()).toEqual({ interval: 6 })

    expect(await httpClient.delete("/eh/history/27", config)).toEqual({ id: 1 })
    const deleteRequest = fetch.mock.calls[2]![0] as Request
    expect(deleteRequest.method).toBe("DELETE")
    expect(new URL(deleteRequest.url).pathname).toBe("/api/eh/history/27")
    expect(deleteRequest.body).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("响应体就是业务数据；空体交出 null", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async () => Response.json({ id: 1 }))
      .mockImplementationOnce(async () => Response.json(false))
      .mockImplementation(async () => new Response(null, { status: 201 }))
    const config = { baseURL: "https://myapi.test/api", env: { fetch } }
    expect(await httpClient.get("/auth/me", config)).toEqual({ id: 1 })
    expect(await httpClient.get("/holiday/is-holiday", config)).toBe(false)
    expect(await httpClient.post("/eh/progress", {}, config)).toBeNull()
    expect(await httpClient.get("/auth/me", config)).toBeNull()
  })

  it("校验失败时的一组文案连成一句", async () => {
    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError("Bad Request", "ERR_BAD_REQUEST", config, null, {
        data: { statusCode: 400, message: ["页码不合法", "上报方标识不合法"], error: "Bad Request" },
        status: 400,
      } as AxiosResponse)
    }
    await expect(httpClient.post("/eh/progress", {}, { adapter })).rejects.toThrow(
      new Error("页码不合法；上报方标识不合法"),
    )
  })

  it("当前令牌失效时清理会话，并使用后端错误文案", async () => {
    const unauthorized = vi.fn()
    onUnauthorized(unauthorized)
    setToken("expired")
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.Authorization).toBe("Bearer expired")
      throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
        data: { statusCode: 401, message: "请重新登录", error: "Unauthorized" },
        status: 401,
      } as AxiosResponse)
    }
    await expect(httpClient.get("/eh/galleries", { adapter })).rejects.toThrow("请重新登录")
    expect(hasToken()).toBe(false)
    expect(unauthorized).toHaveBeenCalledOnce()
  })

  it("旧令牌的迟到 401 不能退出新登录的账号", async () => {
    const unauthorized = vi.fn()
    onUnauthorized(unauthorized)
    setToken("old")
    let fail!: () => void
    const adapter: AxiosAdapter = (config) =>
      new Promise((_resolve, reject) => {
        fail = () =>
          reject(
            new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
              data: { statusCode: 401, message: "已过期", error: "Unauthorized" },
              status: 401,
            } as AxiosResponse),
          )
      })
    const pending = httpClient.get("/eh/galleries", { adapter })
    await vi.waitFor(() => expect(fail).toBeDefined())
    setToken("new")
    fail()
    await expect(pending).rejects.toThrow("已过期")
    expect(hasToken()).toBe(true)
    expect(unauthorized).not.toHaveBeenCalled()
  })

  it("取消请求保留取消标识", async () => {
    const canceled = new CanceledError("canceled")
    await expect(
      httpClient.get("/holiday/detail", {
        adapter: async () => {
          throw canceled
        },
      }),
    ).rejects.toBe(canceled)
  })

  /* 没有本站响应体的失败：Axios 的原文是英文，还带着内部细节，换成界面能直接显示的说明。 */
  it.each([
    { label: "断网", error: () => new AxiosError("Network Error", AxiosError.ERR_NETWORK), message: "网络连接失败" },
    {
      label: "超时",
      error: () => new AxiosError("timeout of 10000ms exceeded", AxiosError.ETIMEDOUT),
      message: "请求超时",
    },
    {
      label: "反向代理回 HTML",
      error: () =>
        new AxiosError("Request failed with status code 502", AxiosError.ERR_BAD_RESPONSE, undefined, null, {
          data: "<html>Bad Gateway</html>",
          status: 502,
        } as AxiosResponse),
      message: "服务器返回了 HTTP 502",
    },
    {
      label: "空响应体",
      error: () =>
        new AxiosError("Request failed with status code 504", AxiosError.ERR_BAD_RESPONSE, undefined, null, {
          data: "",
          status: 504,
        } as AxiosResponse),
      message: "服务器返回了 HTTP 504",
    },
  ])("$label时给出中文说明", async ({ error, message }) => {
    await expect(
      httpClient.get("/holiday/detail", {
        adapter: async () => {
          throw error()
        },
      }),
    ).rejects.toThrow(new Error(message))
  })
})
