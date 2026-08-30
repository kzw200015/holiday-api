/**
 * e 站这边可以预期的失败。
 *
 * 用带标记字段的 Error 而不是自定义 Error 子类，是因为仓库里不写 class；
 * 控制器按 kind 决定回什么状态码和什么文案，别的错误一律当 500。
 */
export type EhFailureKind =
  /** 排队的请求太多，让调用方稍后再来。 */
  | "busy"
  /** 出口 IP 被 e 站临时封了，熔断期内直接拒绝。 */
  | "banned"
  /** 图片配额耗尽（e 站的 509）。 */
  | "quotaExceeded"
  /** 里站返回了空页面：Cookie 无效、过期，或账号没有里站权限。 */
  | "sadPanda"
  /** 撞上内容警告插页，说明请求没带上 nw cookie。 */
  | "contentWarning"
  /** 上游返回了意料之外的东西，通常是版面改了。 */
  | "unavailable"

export interface EhFailure extends Error {
  ehKind: EhFailureKind
}

/** 造一个带 kind 的失败。msg 会原样展示给用户，写成人话。 */
export function ehFailure(kind: EhFailureKind, msg: string, options?: { cause?: unknown }): EhFailure {
  return Object.assign(new Error(msg, options), { ehKind: kind })
}

export function isEhFailure(error: unknown): error is EhFailure {
  return error instanceof Error && typeof (error as Partial<EhFailure>).ehKind === "string"
}

/**
 * 各类失败对应的 HTTP 状态码。
 *
 * 翻译动作放在 app.ts 的 onError 里而不是 eh 子路由的中间件里：
 * Hono 的 compose 在抛出异常的那一层就把它交给全局 onError 了，
 * 上游中间件的 await next() 根本不会 reject，写在中间件里是抓不到的。
 */
export const EH_FAILURE_STATUS: Record<EhFailureKind, 400 | 429 | 502> = {
  busy: 429,
  banned: 429,
  quotaExceeded: 429,
  // Cookie 的问题要用户自己去处理，算请求方的错
  sadPanda: 400,
  contentWarning: 502,
  unavailable: 502,
}
