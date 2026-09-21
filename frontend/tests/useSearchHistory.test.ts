/* @vitest-environment happy-dom */
import { createPinia, disposePinia, type Pinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick } from "vue"

import type * as EhApi from "@/features/eh/api"
import { fetchSearchHistory, saveSearchHistory } from "@/features/eh/api"
import { useSearchHistory } from "@/features/eh/composables/useSearchHistory"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchSearchHistory: vi.fn(),
  saveSearchHistory: vi.fn(),
}))

/* 账号级的一份数据，每个页面读到的都是同一份，所以用例内的几个应用共用一个 pinia。 */
let pinia: Pinia
const apps: ReturnType<typeof createApp>[] = []

function mount() {
  let api!: ReturnType<typeof useSearchHistory>
  const app = createApp({
    setup() {
      api = useSearchHistory()
      return () => null
    },
  })
  app.use(pinia)
  app.mount(document.createElement("div"))
  apps.push(app)
  return api
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  pinia = createPinia()
  vi.mocked(fetchSearchHistory).mockResolvedValue(["猫", "狗"])
  vi.mocked(saveSearchHistory).mockResolvedValue(null)
})
afterEach(() => {
  for (const app of apps.splice(0)) {
    app.unmount()
  }
  disposePinia(pinia)
  vi.useRealTimers()
})

/* 排序、去重、留几条这三条规则由前端说了算，服务端只负责存住推上去的那一份。 */
describe("账号搜索历史", () => {
  it("新搜的排最前，同一个词只留一条", async () => {
    const history = mount()
    await settle()
    history.record("鸟")
    expect(history.entries.value).toEqual(["鸟", "猫", "狗"])
    history.record("狗")
    expect(history.entries.value).toEqual(["狗", "鸟", "猫"])
  })

  it("最多留十条，更早的挤出去", async () => {
    vi.mocked(fetchSearchHistory).mockResolvedValue([])
    const history = mount()
    await settle()
    for (let index = 1; index <= 12; index++) {
      history.record(`词${index}`)
    }
    expect(history.entries.value).toHaveLength(10)
    expect(history.entries.value[0]).toBe("词12")
    expect(history.entries.value).not.toContain("词1")
  })

  /* 后端拒收超过 200 字节的关键词；记进去的话，之后每次整份提交都会带着它一起失败。 */
  it("超长关键词不记", async () => {
    const history = mount()
    await settle()
    history.record("长".repeat(67))
    await settle()
    expect(history.entries.value).toEqual(["猫", "狗"])
    expect(saveSearchHistory).not.toHaveBeenCalled()
    history.record("长".repeat(66))
    expect(history.entries.value[0]).toBe("长".repeat(66))
  })

  it("读失败不算就绪", async () => {
    vi.mocked(fetchSearchHistory).mockRejectedValueOnce(new Error("断网"))
    const history = mount()
    await settle()
    expect(history.ready.value).toBe(false)
    expect(history.loadError.value).toBe("断网")
    history.reload()
    await settle()
    expect(history.ready.value).toBe(true)
  })

  it("删除与清空当场生效，各自整份提交", async () => {
    const history = mount()
    await settle()
    history.remove("猫")
    expect(history.entries.value).toEqual(["狗"])
    await settle()
    expect(saveSearchHistory).toHaveBeenCalledExactlyOnceWith(["狗"])

    history.clear()
    expect(history.entries.value).toEqual([])
    await settle()
    expect(saveSearchHistory).toHaveBeenLastCalledWith([])
  })

  it("推送失败不把已经删掉的词放回来", async () => {
    vi.mocked(saveSearchHistory).mockRejectedValue(new Error("断网"))
    const history = mount()
    await settle()
    history.remove("猫")
    await settle()
    await settle()
    expect(history.entries.value).toEqual(["狗"])
  })
})
