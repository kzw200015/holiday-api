import { createPinia } from "pinia"
import { createApp } from "vue"

import { onUnauthorized } from "@/api/httpClient"
import AppRoot from "@/App"
import { AppRouter } from "@/router"
import { useAppStore } from "@/stores/AppStore"
import { useAuthStore } from "@/stores/AuthStore"

import "@/styles/index.css"

const app = createApp(AppRoot)
const pinia = createPinia()

app.use(pinia)
app.use(AppRouter)

/* 挂载前落地主题，避免暗色用户首帧按亮色绘制再被覆盖 */
useAppStore(pinia).initializeTheme()

/*
 * 会话在使用过程中失效时把人送回登录页。
 * 注入而不是让 httpClient 直接 import router，是因为 router 会加载各个页面、
 * 页面又会 import httpClient，直接依赖就成环了
 */
onUnauthorized(() => {
  useAuthStore(pinia).logout()
  const current = AppRouter.currentRoute.value
  if (current.name !== "login") {
    void AppRouter.replace({ name: "login", query: { redirect: current.fullPath } })
  }
})

app.mount("#app")
