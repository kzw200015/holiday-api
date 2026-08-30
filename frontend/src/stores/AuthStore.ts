import { defineStore } from "pinia"
import { ref } from "vue"

import * as authApi from "@/api/auth"

export const useAuthStore = defineStore("AuthStore", () => {
  const user = ref<authApi.CurrentUser | null>(null)

  /* 是否已经问过后端「我是谁」。路由守卫要等这一步完成才敢判断放不放行 */
  const ready = ref(false)

  /* 刷新登录态。GET /auth/me 未登录时回 200 加 null，所以这里不会因为没登录而抛错 */
  async function refresh() {
    try {
      user.value = await authApi.fetchCurrentUser()
    } catch {
      /* 后端不可达时按未登录处理，页面自己会显示错误 */
      user.value = null
    } finally {
      ready.value = true
    }
  }

  /* 登录和注册都是「成功即认为已登录」，只差调哪个接口 */
  const authenticate =
    (call: typeof authApi.login) => async (username: string, password: string) => {
      user.value = await call(username, password)
      ready.value = true
    }

  const login = authenticate(authApi.login)
  const register = authenticate(authApi.register)

  async function logout() {
    await authApi.logout()
    user.value = null
  }

  /* 会话在使用过程中失效时调用，只清本地状态，跳转由 main.ts 注入的处理器负责 */
  function clear() {
    user.value = null
  }

  return { user, ready, refresh, login, register, logout, clear }
})
