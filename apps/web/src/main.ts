import { createPinia } from "pinia"
import { createApp } from "vue"

import AppRoot from "@/app/App.vue"
import { AppRouter } from "@/app/router"
import { useAuthStore } from "@/features/auth/store"
import { onUnauthorized } from "@/shared/api/httpClient"
import { installQueries } from "@/shared/api/queries"

import "@/styles/index.css"

const app = createApp(AppRoot)
const pinia = createPinia()

app.use(pinia)
installQueries(app)
app.use(AppRouter)

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
