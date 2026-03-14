import { defineStore } from "pinia"
import { ref } from "vue"

const MOBILE_BREAKPOINT = 768

export const useAppStore = defineStore("AppStore", () => {
  const isDark = ref(false)
  const isMobile = ref(false)
  let mql: MediaQueryList | null = null

  function initializeTheme() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    isDark.value = document.documentElement.classList.contains("dark") || prefersDark
    document.documentElement.classList.toggle("dark", isDark.value)
  }

  /* 使用 matchMedia 监听断点变化，仅在穿越阈值时触发 */
  function handleBreakpointChange(e: MediaQueryListEvent | MediaQueryList) {
    isMobile.value = e.matches
  }

  function startResponsiveTracking() {
    if (mql) {
      return
    }
    mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    handleBreakpointChange(mql)
    mql.addEventListener("change", handleBreakpointChange)
  }

  function stopResponsiveTracking() {
    if (!mql) {
      return
    }
    mql.removeEventListener("change", handleBreakpointChange)
    mql = null
  }

  function setDark(value: boolean) {
    isDark.value = value
    document.documentElement.classList.toggle("dark", value)
  }

  return {
    isDark,
    isMobile,
    initializeTheme,
    startResponsiveTracking,
    stopResponsiveTracking,
    setDark,
  }
})
