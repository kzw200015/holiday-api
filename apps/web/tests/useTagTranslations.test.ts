/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as EhApi from "@/features/eh/api"
import { fetchTagTranslationStatus, syncTagTranslations } from "@/features/eh/api"
import { useTagTranslations } from "@/features/eh/composables/useTagTranslations"
import { composableTests, deferred, settleFakeTimers } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchTagTranslationStatus: vi.fn(),
  syncTagTranslations: vi.fn(),
}))

const t = composableTests()
const mount = () => t.mount(useTagTranslations)

const synced = (sha: string): Awaited<ReturnType<typeof EhApi.fetchTagTranslationStatus>> => ({
  lastSync: { sha, count: 44299, syncedAt: "2026-09-24T16:00:00.000Z" },
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.mocked(fetchTagTranslationStatus).mockResolvedValue({ lastSync: null })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("标签译名同步", () => {
  it("同步途中标着进行中，成功后直接换成接口回的状态，不再读一次", async () => {
    const translations = mount()
    await settleFakeTimers()
    expect(translations.status.value).toEqual({ lastSync: null })

    const pending = deferred<Awaited<ReturnType<typeof EhApi.fetchTagTranslationStatus>>>()
    vi.mocked(syncTagTranslations).mockReturnValue(pending.promise)
    const done = translations.sync()
    expect(translations.syncing.value).toBe(true)
    pending.resolve(synced("8699d63"))
    await done
    expect(translations.syncing.value).toBe(false)
    expect(translations.status.value).toEqual(synced("8699d63"))
    expect(fetchTagTranslationStatus).toHaveBeenCalledTimes(1)
  })

  it("同步失败给出文案、保留原来的状态，再次同步前清掉旧的失败提示", async () => {
    vi.mocked(fetchTagTranslationStatus).mockResolvedValue(synced("old"))
    const translations = mount()
    await settleFakeTimers()

    vi.mocked(syncTagTranslations).mockRejectedValue(new Error("拉取标签译名失败，可能是连不上 GitHub"))
    await translations.sync()
    expect(translations.errorMessage.value).toBe("拉取标签译名失败，可能是连不上 GitHub")
    expect(translations.status.value).toEqual(synced("old"))
    expect(translations.syncing.value).toBe(false)

    const pending = deferred<Awaited<ReturnType<typeof EhApi.fetchTagTranslationStatus>>>()
    vi.mocked(syncTagTranslations).mockReturnValue(pending.promise)
    const retry = translations.sync()
    await settleFakeTimers()
    expect(translations.errorMessage.value).toBe("")
    pending.resolve(synced("new"))
    await retry
    expect(translations.status.value).toEqual(synced("new"))
  })
})
