/** 统一 API 响应结构 */
export interface ApiResponse<T> {
  code: number
  data: T
  msg: string
}
