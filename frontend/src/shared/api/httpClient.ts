import axios, { type AxiosError, type AxiosRequestConfig } from "axios"

/* 后端统一响应结构。解包只发生在这一层，所以类型也留在这里 */
interface ApiResponse<T> {
  code: number
  data: T
  msg: string
}

/* 令牌在 localStorage 里的键名 */
const TOKEN_KEY = "myapi_token"

const instance = axios.create({
  baseURL: "/api",
  adapter: "fetch",
})

/*
 * 登录令牌。
 *
 * 存 localStorage 而不是 Cookie：Cookie 由浏览器自动带上，跨站页面能借用户的身份发写请求，
 * 于是还要配一层 CSRF 校验；令牌得由前端主动塞进 Authorization 头，跨站页面读不到也就伪造不了。
 * 代价是 <img src> 这类浏览器直接发起的请求带不了头，图片因此改用后端签名过的地址（见 api/eh.ts）。
 *
 * 读一次就缓在内存里：请求拦截器每个请求都要用，而 localStorage 的读是同步的
 */
let token = readStoredToken()

function readStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ""
  } catch {
    /* 隐私模式等场景下 localStorage 可能直接抛错，此时按未登录处理 */
    return ""
  }
}

/** 登录成功后存下令牌，传空串即为退出登录 */
export function setToken(next: string) {
  token = next
  try {
    if (next) {
      localStorage.setItem(TOKEN_KEY, next)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    /* 存不下就只在内存里留着，刷新后要重新登录，但当前这次会话仍能用 */
  }
}

export function hasToken() {
  return token !== ""
}

instance.interceptors.request.use((config) => {
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/*
 * 令牌失效时的去处。由 main.ts 注入而不是这里直接 import router：
 * router 会加载各个页面，页面又会 import 本文件，直接依赖就成环了
 */
let handleUnauthorized: (() => void) | undefined

export function onUnauthorized(handler: () => void) {
  handleUnauthorized = handler
}

instance.interceptors.response.use(undefined, (error: AxiosError<ApiResponse<unknown>>) => {
  /* 取消请求是页面切换的一部分，保留 Axios 的取消标识。 */
  if (axios.isCancel(error)) {
    return Promise.reject(error)
  }
  if (error.response?.status === 401 && token && error.config?.headers.Authorization === `Bearer ${token}`) {
    /* 旧会话的迟到响应不能清掉刚登录的新会话。 */
    setToken("")
    handleUnauthorized?.()
  }
  /* data 未必是本站的响应体：反向代理返回的空体或 HTML 走的也是这条路。 */
  return Promise.reject(new Error(error.response?.data?.msg || error.message))
})

/** 在 HTTP 边界解包响应，业务接口只返回领域数据。 */
export const httpClient = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await instance.get<ApiResponse<T>>(url, config)
    return response.data.data
  },

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await instance.post<ApiResponse<T>>(url, data, config)
    return response.data.data
  },

  /** 整份替换：同一份重复提交结果不变，重试是安全的。（乱序提交仍会用旧快照盖掉新的，由调用方自己串行。） */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await instance.put<ApiResponse<T>>(url, data, config)
    return response.data.data
  },
}
