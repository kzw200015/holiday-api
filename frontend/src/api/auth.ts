import { HttpClient } from "@/api/httpClient"

/** 当前登录的本站账号 */
export interface CurrentUser {
  id: number
  username: string
}

/** 取当前登录者。未登录时返回 null 而不是报错，所以登录页自己也能调 */
export async function fetchCurrentUser() {
  const response = await HttpClient.get<CurrentUser | null>("/auth/me")
  return response.data
}

/** 登录，成功后会话 Cookie 由后端下发 */
export async function login(username: string, password: string) {
  const response = await HttpClient.post<CurrentUser>("/auth/login", { username, password })
  return response.data
}

/** 注册，成功即登录 */
export async function register(username: string, password: string) {
  const response = await HttpClient.post<CurrentUser>("/auth/register", { username, password })
  return response.data
}

/** 退出登录 */
export async function logout() {
  await HttpClient.post<null>("/auth/logout")
}
