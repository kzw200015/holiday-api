import { AxiosError, CanceledError, type AxiosAdapter, type AxiosResponse } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { hasToken, httpClient, onUnauthorized, setToken } from "@/api/httpClient"

beforeEach(() => {
  setToken("")
  onUnauthorized(vi.fn())
})

describe("HTTP 边界", () => {
  it("默认使用 fetch 适配器，保留查询参数、鉴权头和 JSON 请求体", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => Response.json({ code: 200, data: { id: 1 }, msg: "" }))
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
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("GET 和 POST 都直接返回业务数据，保留 null", async () => {
    const adapter: AxiosAdapter = async (config) => ({
      config,
      data: { code: 200, data: { id: 1 }, msg: "" },
      headers: {},
      status: 200,
      statusText: "OK",
    })
    expect(await httpClient.get("/auth/me", { adapter })).toEqual({ id: 1 })
    expect(await httpClient.post("/auth/login", {}, { adapter })).toEqual({ id: 1 })
    const emptyResponse: AxiosAdapter = async (config) => ({
      config,
      data: { code: 200, data: null, msg: "" },
      headers: {},
      status: 200,
      statusText: "OK",
    })
    expect(await httpClient.post("/eh/progress", {}, { adapter: emptyResponse })).toBeNull()
  })

  it("当前令牌失效时清理会话，并使用后端错误文案", async () => {
    const unauthorized = vi.fn()
    onUnauthorized(unauthorized)
    setToken("expired")
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.Authorization).toBe("Bearer expired")
      throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
        data: { msg: "请重新登录" },
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
              data: { msg: "已过期" },
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

  it("取消请求保留取消标识，网络错误保留实际错误", async () => {
    const canceled = new CanceledError("canceled")
    await expect(
      httpClient.get("/holiday/detail", {
        adapter: async () => {
          throw canceled
        },
      }),
    ).rejects.toBe(canceled)
    await expect(
      httpClient.get("/holiday/detail", {
        adapter: async () => {
          throw new AxiosError("Network Error")
        },
      }),
    ).rejects.toThrow("Network Error")
  })
})
