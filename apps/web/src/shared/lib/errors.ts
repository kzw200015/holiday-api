/*
 * catch 到的不一定是 Error：HTTP 客户端交出的都是带中文说明的 Error，但同一个 try 里的路由跳转、
 * 状态更新也可能抛出别的东西。统一成 Error 再取文案，界面上至少能显示点什么。
 */

export function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}
