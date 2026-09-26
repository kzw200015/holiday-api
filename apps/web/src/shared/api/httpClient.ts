import { treaty, type Treaty } from "@elysia/eden"

import type { App } from "@server/app"

/* 令牌在 localStorage 里的键名 */
const TOKEN_KEY = "myapi_token"

/*
 * 登录令牌。
 *
 * 存 localStorage 而不是 Cookie：Cookie 由浏览器自动带上，跨站页面能借用户的身份发写请求，
 * 于是还要配一层 CSRF 校验；令牌得由前端主动塞进 Authorization 头，跨站页面读不到也就伪造不了。
 * 代价是 <img src> 这类浏览器直接发起的请求带不了头，图片因此改用后端签名过的地址（见 features/eh/api.ts）。
 *
 * 读一次就缓在内存里：每个请求都要用，而 localStorage 的读是同步的
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

/*
 * 令牌失效时的去处。由 main.ts 注入而不是这里直接 import router：
 * router 会加载各个页面，页面又会 import 本文件，直接依赖就成环了
 */
let handleUnauthorized: (() => void) | undefined

export function onUnauthorized(handler: () => void) {
  handleUnauthorized = handler
}

/**
 * 后端接口：路径、入参与响应都从后端的 App 类型推断（Eden），不再手写。只经 request 调用，由它统一处理失败。
 *
 * parseDate 要关掉：它默认把 "2026-01-01" 这样像日期的字符串转成 Date，推断出的类型却仍是 string。
 * 请求头在发起调用的当场取（同步），令牌换了之后发出的请求自然带新令牌。
 */
export const api = treaty<App>(location.origin, {
  parseDate: false,
  headers: () => (token ? { authorization: `Bearer ${token}` } : undefined),
}).api

/*
 * Eden 的调用结果，只看成功时的数据类型。Eden 的类型里 response 一定有，但出网本身失败（断网、中止、超时）时
 * 它其实是 undefined，error.value 是原本抛出的那个错误，request 照这个运行时的事实处理。
 */
type Result<T> = Treaty.TreatyResponse<{ 200: T }>

/**
 * HTTP 边界：交出接口的数据，失败一律变成带中文说明的 Error。
 *
 * 要在发起调用的同一处当场套上，如 `request(api.eh.preferences.get())`：这时的令牌就是这次请求带出去的那个，
 * 旧会话的迟到 401 不会清掉刚登录的新会话。取消请求原样抛出，交给查询库识别。
 * 只回成败的接口（以及「没登录」时的「我是谁」）回的是空体，统一交出 null。
 */
export async function request<T>(pending: Promise<Result<T>>): Promise<T> {
  const sentWith = token
  const result = await pending
  if (!result.error) {
    return (result.data === "" ? null : result.data) as T
  }
  const { status, value } = result.error
  if (!result.response) {
    throw offline(value)
  }
  if (status === 401 && token && sentWith === token) {
    setToken("")
    handleUnauthorized?.()
  }
  throw new Error(describeFailure(status, value))
}

/* 请求没发出去或中途断了。取消原样交回；超时与断网换成能直接显示的说明 */
function offline(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return error
  }
  const timedOut = error instanceof DOMException && error.name === "TimeoutError"
  return new Error(timedOut ? "请求超时" : "网络连接失败", { cause: error })
}

/*
 * 失败时给界面看的那句话。有本站响应体就用它的 message（一组文案时连成一句）；
 * 没有的（反向代理返回的空体或 HTML）只说状态码。
 */
function describeFailure(status: unknown, value: unknown) {
  const message = typeof value === "object" && value !== null && "message" in value ? value.message : undefined
  const text = Array.isArray(message) ? message.join("；") : message
  if (typeof text === "string" && text) {
    return text
  }
  return `服务器返回了 HTTP ${String(status)}`
}

/**
 * 带时限的 request：到点就中止，这一次算没存上（报「请求超时」）。send 要把给它的 signal 交给这次调用，
 * 如 `requestWithin(ms, (signal) => api.eh.history.delete(undefined, { fetch: { signal } }))`。
 * 不用 AbortSignal.timeout：它的计时器不经页面的 setTimeout，测试里的假时钟推不动它。
 */
export async function requestWithin<T>(ms: number, send: (signal: AbortSignal) => Promise<Result<T>>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException("请求超时", "TimeoutError")), ms)
  try {
    return await request(send(controller.signal))
  } finally {
    clearTimeout(timer)
  }
}
