/* @vitest-environment happy-dom */
import { createPinia } from "pinia"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick, type App } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import { authenticate } from "@/features/auth/api"
import { useAuthStore } from "@/features/auth/store"
import LoginView from "@/features/auth/views/LoginView.vue"

vi.mock("@/features/auth/api", () => ({ authenticate: vi.fn() }))

let app: App
let host: HTMLElement

afterEach(() => {
  app.unmount()
  host.remove()
  localStorage.clear()
  vi.resetAllMocks()
})

describe("登录表单", () => {
  it.each(["login", "register"] as const)("%s使用输入值提交，失败保留表单，重试成功后回到目标页", async (action) => {
    vi.mocked(authenticate)
      .mockRejectedValueOnce(new Error("暂时无法登录"))
      .mockResolvedValueOnce({ token: "test-token", user: { id: 1, username: "tester" } })
    const pinia = createPinia()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", component: LoginView },
        { path: "/eh", name: "gallery-list", component: { render: () => null } },
        { path: "/settings", component: { render: () => null } },
      ],
    })
    await router.push("/login?redirect=/settings")
    host = document.createElement("div")
    document.body.append(host)
    app = createApp(RouterView).use(pinia).use(router)
    app.mount(host)
    if (action === "register") {
      host.querySelector<HTMLButtonElement>('button[type="button"]')!.click()
      await nextTick()
    }
    const username = host.querySelector<HTMLInputElement>("#username")!
    const password = host.querySelector<HTMLInputElement>("#password")!
    username.value = "tester"
    username.dispatchEvent(new Event("input", { bubbles: true }))
    password.value = "test-password"
    password.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    expect(password.autocomplete).toBe(action === "register" ? "new-password" : "current-password")
    const form = host.querySelector("form")!
    const submit = new Event("submit", { bubbles: true, cancelable: true })
    form.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(host.textContent).toContain("暂时无法登录"))
    expect(authenticate).toHaveBeenCalledWith(action, "tester", "test-password")
    expect(username.value).toBe("tester")
    expect(password.value).toBe("test-password")
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/settings"))
    expect(authenticate).toHaveBeenCalledTimes(2)
    expect(useAuthStore(pinia).user?.username).toBe("tester")
  })
})
