import { AxiosError, CanceledError, type AxiosAdapter, type AxiosResponse } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { hasToken, httpClient, onUnauthorized, setToken } from "@/api/httpClient"

beforeEach(() => {
  setToken("")
  onUnauthorized(vi.fn())
})

describe("HTTP 边界", () => {
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
