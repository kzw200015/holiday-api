import type { ApiResponse } from "@/types/apiResponse"
import type { AxiosError, AxiosRequestConfig } from "axios"
import axios from "axios"

export type { ApiResponse }

/*
 * 接口前缀。不导出：图片地址由后端连签名一起签好下发（见 api/eh.ts），
 * 前端没有第二处需要自己拼 /api 的地方
 */
const API_BASE = "/api"

/* 令牌在 localStorage 里的键名 */
const TOKEN_KEY = "myapi_token"

const instance = axios.create({
  baseURL: API_BASE,
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

type ApiErrorResponse = ApiResponse<unknown>

function resolveErrorMessage(error: AxiosError<ApiErrorResponse>) {
  return error.response?.data.msg || error.message
}

/*
 * 令牌失效时的去处。由 main.ts 注入而不是这里直接 import router：
 * router 会加载各个页面，页面又会 import 本文件，直接依赖就成环了
 */
let handleUnauthorized: (() => void) | undefined

export function onUnauthorized(handler: () => void) {
  handleUnauthorized = handler
}

instance.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.status === 401) {
      /* 令牌已经过期或被改过，留着只会让后续每个请求都白跑一趟 */
      setToken("")
      handleUnauthorized?.()
    }
    return Promise.reject(new Error(resolveErrorMessage(error)))
  },
)

/**
 * 取出可以直接显示给用户的报错文案。
 *
 * 上面的拦截器保证 reject 出来的一定是携带后端 msg 的 Error，所以正常路径永远走第一个分支；
 * fallback 是给「try 块里混进了别的异常」兜底的。这条约定放在这里而不是让每个页面各写一遍，
 * 是因为它属于本文件的契约，改了拦截器就该改这里。
 */
export function errorText(error: unknown, fallback = "操作失败"): string {
  return error instanceof Error ? error.message : fallback
}

/** 类型安全的 HTTP 客户端，利用 axios 泛型重载声明拦截器解包后的返回类型 */
export const HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return instance.get<unknown, ApiResponse<T>>(url, config)
  },

  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return instance.post<unknown, ApiResponse<T>>(url, data, config)
  },
}
