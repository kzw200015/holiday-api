/*
 * 前后端共用的接口契约：请求的 zod schema（服务端据此校验，前端据此在提交前预先挡掉会被退回的内容），
 * 以及响应的类型。响应只有类型、不做运行时校验。
 */
export * from "./auth.js"
export * from "./eh.js"
export * from "./holiday.js"
export { utf8Length } from "./text.js"
