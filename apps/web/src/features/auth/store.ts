import type { CurrentUser } from "@myapi/shared"
import { defineStore } from "pinia"
import { ref } from "vue"

import * as authApi from "@/features/auth/api"
import { hasToken, setToken } from "@/shared/api/httpClient"

export const useAuthStore = defineStore("AuthStore", () => {
  const user = ref<CurrentUser | null>(null)

  /* 是否已经问过后端「我是谁」。路由守卫要等这一步完成才敢判断放不放行 */
  const ready = ref(false)
  /* 账号一变就加一：页面缓存以它为 key 整体重建，各业务模块的 store 也监听它自行清空；这里不保存页面数据。 */
  const pageRevision = ref(0)

  /* 刷新登录态。GET /auth/me 未登录时回 200 加 null，所以这里不会因为没登录而抛错 */
  async function refresh() {
    /* 本地根本没有令牌就不必问了，问也只会得到 null */
    if (!hasToken()) {
      user.value = null
      ready.value = true
      return
    }
    try {
      user.value = await authApi.fetchCurrentUser()
    } catch {
      /* 无法恢复会话时回到登录流程，不带着未确认的账号进入受保护页面。 */
      user.value = null
    } finally {
      ready.value = true
    }
  }

  async function authenticate(action: authApi.AuthAction, username: string, password: string) {
    const session = await authApi.authenticate(action, { username, password })
    pageRevision.value += 1
    setToken(session.token)
    user.value = session.user
    ready.value = true
  }

  /* 退出与令牌失效共用清理入口，避免下一个账号复用旧页面和凭据草稿。 */
  function logout() {
    setToken("")
    user.value = null
    ready.value = true
    pageRevision.value += 1
  }

  return { user, ready, pageRevision, refresh, authenticate, logout }
})
