import type { Authenticated, AuthOptions, Credentials, CurrentUser } from "@myapi/shared"

import { httpClient } from "@/shared/api/httpClient"

/** 不用登录也能取 */
export function fetchAuthOptions(signal?: AbortSignal) {
  return httpClient.get<AuthOptions>("/auth/options", { signal })
}

/** 取当前登录者。未登录时返回 null 而不是报错，所以登录页自己也能调 */
export function fetchCurrentUser() {
  return httpClient.get<CurrentUser | null>("/auth/me")
}

export type AuthAction = "login" | "register"

/** 登录与注册都返回新会话，持久化和账号切换交给 AuthStore。 */
export function authenticate(action: AuthAction, credentials: Credentials) {
  return httpClient.post<Authenticated>(`/auth/${action}`, credentials)
}
