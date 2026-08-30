/**
 * 所有接口的统一响应体，与前端 src/types/apiResponse.ts 保持一致。
 *
 * 字段顺序即 JSON 序列化顺序：code、data、msg。
 */
export interface ApiResponse<T> {
  code: number
  data: T
  msg: string
}

/** 构造成功响应。 */
export function ok<T>(data: T): ApiResponse<T> {
  return { code: 200, data, msg: "OK" }
}

/**
 * 构造任意状态码的失败响应。
 * 下面几个具名构造函数都是它的固定参数版，留着是为了让调用处一眼看出状态码。
 */
export function failure(code: number, msg: string): ApiResponse<null> {
  return { code, data: null, msg }
}

/** 构造参数错误响应。 */
export function badRequest(msg: string): ApiResponse<null> {
  return failure(400, msg)
}

/** 构造未登录（或会话已过期）响应。 */
export function unauthorized(msg: string): ApiResponse<null> {
  return failure(401, msg)
}

/** 构造资源不存在响应。 */
export function notFound(): ApiResponse<null> {
  return failure(404, "Not Found")
}

/** 构造服务端错误响应。 */
export function internalServerError(msg: string): ApiResponse<null> {
  return failure(500, msg)
}
