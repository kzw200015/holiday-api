/* @vitest-environment happy-dom */
import { createPinia, disposePinia, type Pinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useThemeStore } from "@/app/themeStore"

let pinia: Pinia

/* 模拟系统配色；happy-dom 默认按亮色回答。 */
function prefersDark(dark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: dark && query === "(prefers-color-scheme: dark)" }) as MediaQueryList,
  )
}

/* 每次启动都是新的一份 store，和刷新页面一样。 */
function start() {
  disposePinia(pinia)
  pinia = createPinia()
  const theme = useThemeStore(pinia)
  theme.initializeTheme()
  return theme
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  pinia = createPinia()
})
afterEach(() => {
  disposePinia(pinia)
  vi.restoreAllMocks()
})

describe("主题", () => {
  it("没选过就跟随系统", () => {
    prefersDark(true)
    expect(start().isDark).toBe(true)
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("手动切换后记下来，下次启动优先用记下的", () => {
    prefersDark(true)
    start().toggle()
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(start().isDark).toBe(false)
    expect(document.documentElement.classList.contains("dark")).toBe(false)

    prefersDark(false)
    start().toggle()
    expect(start().isDark).toBe(true)
  })

  it("存不下时当次照样切换", () => {
    prefersDark(false)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("隐私模式")
    })
    const theme = start()
    theme.toggle()
    expect(theme.isDark).toBe(true)
  })
})
