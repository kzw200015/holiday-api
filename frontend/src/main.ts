import { createApp } from "vue"
import { createPinia } from "pinia"

import AppRoot from "@/App.vue"
import { AppRouter } from "@/router"

import "element-plus/dist/index.css"
import "element-plus/theme-chalk/dark/css-vars.css"
import "@/styles/index.css"
import { ElLoading } from "element-plus";

const app = createApp(AppRoot)

app.use(createPinia())
app.use(AppRouter)
app.directive("loading", ElLoading.directive)
app.mount("#app")
