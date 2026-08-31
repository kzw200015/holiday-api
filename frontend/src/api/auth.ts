import { HttpClient, setToken } from "@/api/httpClient"

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
export async function fetchCurrentUser() {
  const response = await HttpClient.get<CurrentUser | null>("/auth/me")
  return response.data
}

/** 登录，成功后把令牌存下来，之后每个请求由拦截器自动带上 */
export async function login(username: string, password: string) {
  const response = await HttpClient.post<AuthenticatedUser>("/auth/login", { username, password })
  setToken(response.data.token)
  return response.data.user
}

/** 注册，成功即登录 */
export async function register(username: string, password: string) {
  const response = await HttpClient.post<AuthenticatedUser>("/auth/register", { username, password })
  setToken(response.data.token)
  return response.data.user
}

/**
 * 退出登录。
 * 没有对应的后端接口：令牌是无状态的，服务端不存已签发的令牌也就作废不了，
 * 退出就是把本地这份丢掉，剩下的等它自己过期
 */
export function logout() {
  setToken("")
}
