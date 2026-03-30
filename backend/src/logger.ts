import pino from "pino"

/** 应用日志实例，开发环境使用 pino-pretty 格式化输出 */
export const logger = pino({
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
    },
  }),
})
