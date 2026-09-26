/* 各状态码的标准短语，放进响应体的 error 字段 */
const REASONS = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
} as const

export type ErrorStatus = keyof typeof REASONS

/** 失败时的响应体：message 是给用户看的中文，校验失败时是一组文案。 */
export interface ErrorBody {
  statusCode: ErrorStatus
  message: string | string[]
  error: (typeof REASONS)[ErrorStatus]
}

/**
 * 可预期的失败：抛出后由应用统一回成 `{statusCode, message, error}`。
 *
 * message 原样给用户看，不放上游原话、地址这类细节；细节作为 cause 交出，要进日志的由抛出方自己记。
 */
export class HttpError extends Error {
  readonly status: ErrorStatus
  readonly messages: string | string[]

  constructor(status: ErrorStatus, messages: string | string[], options?: ErrorOptions) {
    super(Array.isArray(messages) ? messages.join("；") : messages, options)
    this.status = status
    this.messages = messages
  }

  get body(): ErrorBody {
    return { statusCode: this.status, message: this.messages, error: REASONS[this.status] }
  }
}

export const badRequest = (message: string | string[]) => new HttpError(400, message)
export const unauthorized = (message: string) => new HttpError(401, message)
export const forbidden = (message: string) => new HttpError(403, message)
export const notFound = (message: string) => new HttpError(404, message)
export const serviceUnavailable = (message: string) => new HttpError(503, message)
