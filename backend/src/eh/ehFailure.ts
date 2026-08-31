/**
 * e 站这边可以预期的失败。
 *
 * app.ts 的 onError 按 kind 决定回什么状态码和什么文案，别的错误一律当 500。
 */
export type EhFailureKind =
  /** 出口 IP 被 e 站临时封了。 */
  | "banned"
  /** 图片配额耗尽（e 站的 509）。 */
  | "quotaExceeded"
  /** 里站返回了空页面：Cookie 无效、过期，或账号没有里站权限。 */
  | "sadPanda"
  /** 撞上内容警告插页，说明请求没带上 nw cookie。 */
  | "contentWarning"
  /** 图片地址的签名不对或已过期。这是本站自己的判断，跟上游没关系。 */
  | "badSignature"
  /** 上游返回了意料之外的东西，通常是版面改了。 */
  | "unavailable"

/** 带 kind 的失败。msg 会原样展示给用户，写成人话。 */
export class EhFailure extends Error {
  constructor(
    readonly ehKind: EhFailureKind,
    msg: string,
    options?: { cause?: unknown },
  ) {
    super(msg, options)
  }
}

/**
 * 配额耗尽的提示语。
 * 页面请求（509 落在 classifyResponse 里）和图片请求（openImage 自己看状态码）
 * 是两条独立的路径，文案放这里免得两边各写一句、越漂越远。
 */
export const QUOTA_EXCEEDED_MSG = "e 站图片配额已用尽，等额度恢复后再试"

/**
 * 各类失败对应的 HTTP 状态码。
 *
 * 翻译动作放在 app.ts 的 onError 里而不是 eh 子路由的中间件里：
 * Hono 的 compose 在抛出异常的那一层就把它交给全局 onError 了，
 * 上游中间件的 await next() 根本不会 reject，写在中间件里是抓不到的。
 */
export const EH_FAILURE_STATUS: Record<EhFailureKind, 400 | 403 | 429 | 502> = {
  banned: 429,
  quotaExceeded: 429,
  // Cookie 的问题要用户自己去处理，算请求方的错
  sadPanda: 400,
  // 签名过期是有效期到点后的正常现象（默认 24 小时），不是上游故障。
  // 混进 502 的话，「图片地址过期」这种日常噪音会把「e 站真的挂了」的信号淹掉
  badSignature: 403,
  contentWarning: 502,
  unavailable: 502,
}
