import { createApp } from "vue"
import { createPinia } from "pinia"

import AppRoot from "@/App"
import { AppRouter } from "@/router"

import "@/styles/index.css"

const app = createApp(AppRoot)

app.use(createPinia())
app.use(AppRouter)
app.mount("#app")
