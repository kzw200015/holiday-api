/* @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick, ref } from "vue"

import { useRequest } from "@/shared/composables/useRequest"
import { deferred, present } from "./support"

const apps: ReturnType<typeof createApp>[] = []

function mount(fetcher: (key: string, signal: AbortSignal) => Promise<string>) {
  const key = ref("a")
  let api: ReturnType<typeof useRequest<string>> | undefined
  const app = createApp({
    setup() {
      api = useRequest([key], (signal) => fetcher(key.value, signal))
      return () => null
    },
  })
  app.mount(document.createElement("div"))
  apps.push(app)
  return { key, api: present(api, "useRequest 的返回值"), app }
}

afterEach(() => {
  for (const app of apps.splice(0)) {
    app.unmount()
  }
})

describe("跟着参数走的读取", () => {
  it("参数变了就取消上一次，迟到的旧结果和旧错误都不算数", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { key, api } = mount(fetcher)
    expect(api.loading.value).toBe(true)

    key.value = "b"
    await nextTick()
    expect(fetcher.mock.calls[0]?.[1].aborted).toBe(true)
    expect(fetcher).toHaveBeenLastCalledWith("b", expect.any(AbortSignal))

    second.resolve("b 的结果")
    await nextTick()
    first.reject(new Error("a 失败了"))
    await nextTick()
    expect(api.data.value).toBe("b 的结果")
    expect(api.errorMessage.value).toBe("")
    expect(api.loading.value).toBe(false)
  })

  it("换参数先丢掉上一份结果，新结果回来前算加载中", async () => {
    const second = deferred<string>()
    const fetcher = vi.fn().mockResolvedValueOnce("a 的结果").mockReturnValueOnce(second.promise)
    const { key, api } = mount(fetcher)
    await nextTick()
    expect(api.data.value).toBe("a 的结果")

    key.value = "b"
    await nextTick()
    expect(api.data.value).toBeUndefined()
    expect(api.loading.value).toBe(true)
    second.resolve("b 的结果")
    await nextTick()
    expect(api.data.value).toBe("b 的结果")
  })

  it("失败后重试，重试期间不再显示旧错误", async () => {
    const retry = deferred<string>()
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("断网")).mockReturnValueOnce(retry.promise)
    const { api } = mount(fetcher)
    await nextTick()
    expect(api.errorMessage.value).toBe("断网")
    expect(api.loading.value).toBe(false)

    api.reload()
    expect(api.errorMessage.value).toBe("")
    expect(api.loading.value).toBe(true)
    retry.resolve("好了")
    await nextTick()
    expect(api.data.value).toBe("好了")
  })

  it("组件销毁时取消在途请求，迟到的结果不再写入", async () => {
    const pending = deferred<string>()
    const fetcher = vi.fn().mockReturnValueOnce(pending.promise)
    const { api, app } = mount(fetcher)
    app.unmount()
    apps.splice(apps.indexOf(app), 1)
    expect(fetcher.mock.calls[0]?.[1].aborted).toBe(true)
    pending.resolve("迟到的结果")
    await nextTick()
    expect(api.data.value).toBeUndefined()
  })
})
