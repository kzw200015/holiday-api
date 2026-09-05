import { httpClient } from "@/api/httpClient"

/** 当前登录的本站账号 */
export interface CurrentUser {
  id: number
  username: string
}

/** 登录与注册的返回：令牌加用户本身 */
interface AuthenticatedUser {
  token: string
  user: CurrentUser
}

/** 取当前登录者。未登录时返回 null 而不是报错，所以登录页自己也能调 */
export function fetchCurrentUser() {
  return httpClient.get<CurrentUser | null>("/auth/me")
}

export type AuthAction = "login" | "register"

/** 登录与注册都返回新会话，持久化和账号切换交给 AuthStore。 */
export function authenticate(action: AuthAction, username: string, password: string) {
  return httpClient.post<AuthenticatedUser>(`/auth/${action}`, { username, password })
}
