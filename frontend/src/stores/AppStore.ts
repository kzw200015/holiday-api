import { defineStore } from "pinia"
import { ref } from "vue"

const MOBILE_BREAKPOINT = 768

export const useAppStore = defineStore("AppStore", () => {
  const isDark = ref(false)
  const isMobile = ref(false)
  let isResponsiveTrackingStarted = false

  function initializeTheme() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    isDark.value = document.documentElement.classList.contains("dark") || prefersDark
    document.documentElement.classList.toggle("dark", isDark.value)
  }

  function updateViewportMode() {
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
  }

  function startResponsiveTracking() {
    if (isResponsiveTrackingStarted) {
      return
    }
    updateViewportMode()
    window.addEventListener("resize", updateViewportMode)
    isResponsiveTrackingStarted = true
  }

  function stopResponsiveTracking() {
    if (!isResponsiveTrackingStarted) {
      return
    }
    window.removeEventListener("resize", updateViewportMode)
    isResponsiveTrackingStarted = false
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
