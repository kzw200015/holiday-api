/** 统一 API 响应结构 */
export interface ApiResponse<T> {
  code: number;
  data: T;
  msg: string;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { code: 200, data, msg: "OK" };
}

export function badRequest(msg: string): ApiResponse<null> {
  return { code: 400, data: null, msg };
}

export function notFound(): ApiResponse<null> {
  return { code: 404, data: null, msg: "Not Found" };
}

export function internalServerError(msg: string): ApiResponse<null> {
  return { code: 500, data: null, msg };
}
