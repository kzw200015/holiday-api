import { defineStore } from "pinia"
import { ref } from "vue"

export const useAppStore = defineStore("AppStore", () => {
    const isDark = ref(false)

    function initializeTheme() {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        isDark.value = document.documentElement.classList.contains("dark") || prefersDark
        document.documentElement.classList.toggle("dark", isDark.value)
    }

    function setDark(value: boolean) {
        isDark.value = value
        document.documentElement.classList.toggle("dark", value)
    }

    return {
        isDark,
        initializeTheme,
        setDark,
    }
})
