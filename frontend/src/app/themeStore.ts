import { defineStore } from "pinia"
import { ref } from "vue"

export const useThemeStore = defineStore("ThemeStore", () => {
  const isDark = ref(false)

  /* 统一落地主题：切换暗色 class，并让移动端地址栏配色跟随 --background */
  function setDark(value: boolean) {
    isDark.value = value
    document.documentElement.classList.toggle("dark", value)

    const background = getComputedStyle(document.documentElement).getPropertyValue("--background")
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background.trim())
  }

  function initializeTheme() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    setDark(document.documentElement.classList.contains("dark") || prefersDark)
  }

  return {
    isDark,
    initializeTheme,
    setDark,
  }
})
