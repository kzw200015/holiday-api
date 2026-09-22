import { defineStore } from "pinia"
import { ref } from "vue"

/* 用户手动选过的主题在 localStorage 里的键名；没选过就跟随系统 */
const THEME_KEY = "myapi_theme"

function readStoredTheme(): "dark" | "light" | undefined {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === "dark" || stored === "light" ? stored : undefined
  } catch {
    /* 隐私模式等场景下 localStorage 可能直接抛错，此时按没选过处理 */
    return undefined
  }
}

export const useThemeStore = defineStore("ThemeStore", () => {
  const isDark = ref(false)

  /* 统一落地主题：切换暗色 class，并让移动端地址栏配色跟随 --background */
  function setDark(value: boolean) {
    isDark.value = value
    document.documentElement.classList.toggle("dark", value)

    const background = getComputedStyle(document.documentElement).getPropertyValue("--background")
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background.trim())
  }

  /* 手动选过的优先，没选过才跟随系统 */
  function initializeTheme() {
    const stored = readStoredTheme()
    setDark(stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches)
  }

  /* 手动切换并记下来，下次打开沿用。存不下就只管这一次 */
  function toggle() {
    setDark(!isDark.value)
    try {
      localStorage.setItem(THEME_KEY, isDark.value ? "dark" : "light")
    } catch {
      /* 隐私模式下存不下，只管这一次 */
    }
  }

  return {
    isDark,
    initializeTheme,
    toggle,
  }
})
