type ErrorStatus = 400 | 404 | 500 | 503

/**
 * 可预期的失败：抛出后由应用统一回成 `{code, message}`，code 与 HTTP 状态码相同。
 *
 * message 原样给调用方看，不放上游原话、地址这类细节。
 */
export class HttpError extends Error {
  readonly status: ErrorStatus

  constructor(status: ErrorStatus, message: string) {
    super(message)
    this.status = status
  }

  get body() {
    return { code: this.status, message: this.message }
  }
}

export const badRequest = (message: string) => new HttpError(400, message)
export const notFound = (message: string) => new HttpError(404, message)
export const serviceUnavailable = (message: string) => new HttpError(503, message)
