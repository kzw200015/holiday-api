import type { InferRequestType } from "hono/client"

import { api, request } from "@/shared/api/httpClient"

/** 不用登录也能取 */
export function fetchAuthOptions(signal?: AbortSignal) {
  return request(api.auth.options.$get(undefined, { init: { signal } }))
}

/** 取当前登录者。未登录时返回 null 而不是报错，所以登录页自己也能调 */
export function fetchCurrentUser() {
  return request(api.auth.me.$get())
}

export type AuthAction = "login" | "register"

/** 登录与注册都返回新会话，持久化和账号切换交给 AuthStore。 */
export function authenticate(
  action: AuthAction,
  credentials: InferRequestType<(typeof api.auth)[AuthAction]["$post"]>["json"],
) {
  return request(api.auth[action].$post({ json: credentials }))
}
