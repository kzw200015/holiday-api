/* @vitest-environment happy-dom */
import { createPinia } from "pinia"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick, type App } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import { authenticate, fetchAuthOptions } from "@/features/auth/api"
import { useAuthStore } from "@/features/auth/store"
import LoginView from "@/features/auth/views/LoginView.vue"

vi.mock("@/features/auth/api", () => ({ authenticate: vi.fn(), fetchAuthOptions: vi.fn() }))

let app: App
let host: HTMLElement

afterEach(() => {
  app.unmount()
  host.remove()
  localStorage.clear()
  vi.resetAllMocks()
})

async function mountLogin() {
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
  return { pinia, router }
}

describe("登录表单", () => {
  it.each(["login", "register"] as const)("%s使用输入值提交，失败保留表单，重试成功后回到目标页", async (action) => {
    vi.mocked(fetchAuthOptions).mockResolvedValue({ allowRegistration: true })
    vi.mocked(authenticate)
      .mockRejectedValueOnce(new Error("暂时无法登录"))
      .mockResolvedValueOnce({ token: "test-token", user: { id: 1, username: "tester" } })
    const { pinia, router } = await mountLogin()
    await vi.waitFor(() => expect(host.textContent).toContain("还没有账号，去注册"))
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

  /* 关了注册、或者没问到，都不给注册入口：点进去填完才被退回，比一开始就没有更糟。 */
  it.each([
    ["注册已关闭", () => vi.mocked(fetchAuthOptions).mockResolvedValue({ allowRegistration: false })],
    ["读不到设置", () => vi.mocked(fetchAuthOptions).mockRejectedValue(new Error("网络错误"))],
  ])("%s时不显示注册入口，登录照常可用", async (_, arrange) => {
    arrange()
    await mountLogin()
    expect(fetchAuthOptions).toHaveBeenCalledTimes(1)
    /* 等这次读取落地、页面按结果重新渲染之后再看。 */
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.textContent).not.toContain("去注册")
    expect(host.querySelector('button[type="button"]')).toBeNull()
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent).toContain("登录")
  })
})
