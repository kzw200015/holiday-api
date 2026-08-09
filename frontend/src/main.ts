import { createApp } from "vue"
import { createPinia } from "pinia"

import AppRoot from "@/App"
import { AppRouter } from "@/router"
import { useAppStore } from "@/stores/AppStore"

import "@/styles/index.css"

const app = createApp(AppRoot)
const pinia = createPinia()

app.use(pinia)
app.use(AppRouter)

/* 挂载前落地主题，避免暗色用户首帧按亮色绘制再被覆盖 */
useAppStore(pinia).initializeTheme()

app.mount("#app")
