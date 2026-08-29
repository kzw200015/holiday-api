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

/** 构造参数错误响应。 */
export function badRequest(msg: string): ApiResponse<null> {
  return { code: 400, data: null, msg }
}

/** 构造资源不存在响应。 */
export function notFound(): ApiResponse<null> {
  return { code: 404, data: null, msg: "Not Found" }
}

/** 构造服务端错误响应。 */
export function internalServerError(msg: string): ApiResponse<null> {
  return { code: 500, data: null, msg }
}
