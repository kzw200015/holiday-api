/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, KeepAlive, nextTick } from "vue"

import type * as EhApi from "@/api/eh"
import { clearSearchHistory, fetchGalleryPreferences, fetchSearchHistory, recordSearch, removeSearch } from "@/api/eh"
import GallerySearchForm from "@/components/gallery/GallerySearchForm.vue"

vi.mock("@/api/eh", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryPreferences: vi.fn(),
  fetchSearchHistory: vi.fn(),
  recordSearch: vi.fn(),
  removeSearch: vi.fn(),
  clearSearchHistory: vi.fn(),
}))

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
const onSearch = vi.fn()
const onRestore = vi.fn()

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

async function mountForm() {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(KeepAlive, {}, { default: () => h(GallerySearchForm, { onSearch, onRestore }) }) })
  app.mount(host)
  await settle()
}

async function submit(keyword: string) {
  const input = host.querySelector("input")!
  input.value = keyword
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await settle()
}

async function clearHistory() {
  const trigger = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "清空")!
  trigger.click()
  await settle()
  const confirm = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "清空历史")!
  confirm.click()
  await settle()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 5 })
  vi.mocked(fetchSearchHistory).mockResolvedValue(["cat"])
  vi.mocked(recordSearch).mockResolvedValue(["dog", "cat"])
  vi.mocked(removeSearch).mockResolvedValue(["dog"])
  vi.mocked(clearSearchHistory).mockResolvedValue(null)
})
afterEach(() => {
  app?.unmount()
  host.remove()
})

describe("图库搜索表单", () => {
  it("首次激活只读取一次，恢复分类不提交关键词或保存历史", async () => {
    await mountForm()
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
    expect(fetchSearchHistory).toHaveBeenCalledTimes(1)
    expect(onRestore).toHaveBeenCalledExactlyOnceWith({ keyword: "", categories: ["manga"] })
    expect(onSearch).not.toHaveBeenCalled()
    expect(recordSearch).not.toHaveBeenCalled()
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
  })

  it("提交搜索与历史操作由组件处理，删除和清空不触发搜索", async () => {
    await mountForm()
    await submit("   ")
    expect(recordSearch).not.toHaveBeenCalled()
    await submit(" dog ")
    expect(recordSearch).toHaveBeenCalledExactlyOnceWith("dog")
    expect(onSearch).toHaveBeenLastCalledWith({ keyword: "dog", categories: ["manga"] })
    expect(host.querySelector('[title="dog"]')).not.toBeNull()
    host.querySelector<HTMLButtonElement>('[aria-label="删除历史：cat"]')!.click()
    await settle()
    expect(removeSearch).toHaveBeenCalledExactlyOnceWith("cat")
    expect(host.querySelector('[title="cat"]')).toBeNull()
    await clearHistory()
    expect(clearSearchHistory).toHaveBeenCalledExactlyOnceWith()
    expect(host.textContent).toContain("暂无搜索历史")
    expect(onSearch).toHaveBeenCalledTimes(2)
  })

  it("保存和清空失败保留已确认历史，错误不阻止本次搜索", async () => {
    await mountForm()
    vi.mocked(recordSearch).mockRejectedValue(new Error("断网"))
    await submit("dog")
    expect(onSearch).toHaveBeenCalledExactlyOnceWith({ keyword: "dog", categories: ["manga"] })
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
    expect(host.querySelector('[title="dog"]')).toBeNull()
    expect(host.textContent).toContain("搜索历史保存失败")
    expect(recordSearch).toHaveBeenCalledTimes(1)
    vi.mocked(clearSearchHistory).mockRejectedValue(new Error("断网"))
    await clearHistory()
    expect(host.textContent).toContain("清空搜索历史失败")
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
  })

  it("迟到的历史读取响应不能覆盖刚完成的搜索记录", async () => {
    let resolve!: (value: string[]) => void
    vi.mocked(fetchSearchHistory).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    await mountForm()
    await submit("dog")
    resolve(["旧历史"])
    await settle()
    expect(host.querySelector('[title="dog"]')).not.toBeNull()
    expect(host.querySelector('[title="旧历史"]')).toBeNull()
  })

  it("销毁时取消在途读取，不再向页面发送恢复查询", async () => {
    let resolve!: (value: EhApi.GalleryPreferences) => void
    vi.mocked(fetchGalleryPreferences).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    vi.mocked(fetchSearchHistory).mockReturnValue(new Promise(() => {}))
    await mountForm()
    app!.unmount()
    app = undefined
    expect(vi.mocked(fetchGalleryPreferences).mock.calls[0]![0]!.aborted).toBe(true)
    expect(vi.mocked(fetchSearchHistory).mock.calls[0]![0]!.aborted).toBe(true)
    resolve({ categories: ["manga"], readerInterval: 5 })
    await settle()
    expect(onRestore).not.toHaveBeenCalled()
  })
})
