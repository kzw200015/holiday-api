import { defineStore } from "pinia"
import { ref } from "vue"

import * as authApi from "@/api/auth"
import { hasToken, setToken } from "@/api/httpClient"

export const useAuthStore = defineStore("AuthStore", () => {
  const user = ref<authApi.CurrentUser | null>(null)

  /* 是否已经问过后端「我是谁」。路由守卫要等这一步完成才敢判断放不放行 */
  const ready = ref(false)
  const sessionRevision = ref(0)
  const galleryRevision = ref(0)

  /* 只通知组件缓存失效，不在账号 store 保存任何图库页面数据。 */
  function invalidateGalleries() {
    galleryRevision.value += 1
  }

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
    const session = await authApi.authenticate(action, username, password)
    sessionRevision.value += 1
    invalidateGalleries()
    setToken(session.token)
    user.value = session.user
    ready.value = true
  }

  /* 退出与令牌失效共用清理入口，避免下一个账号复用前一个账号的图库。 */
  function logout() {
    setToken("")
    user.value = null
    ready.value = true
    sessionRevision.value += 1
    invalidateGalleries()
  }

  return { user, ready, sessionRevision, galleryRevision, invalidateGalleries, refresh, authenticate, logout }
})
