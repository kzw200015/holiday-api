import { relative } from "node:path"
import { fileURLToPath } from "node:url"
import { pino, type Logger } from "pino"

import { env } from "@server/config"

/* 本文件就在 src/ 下 */
const SRC = import.meta.dirname

/* 整个进程共用的 pino：每行一个 JSON，写到标准输出，由容器收集。本地开发由 dev 脚本接上 pino-pretty。 */
const root = pino({ level: env.LOG_LEVEL })

/**
 * 某个模块的日志：pino 的 child，每行带上来源（module 字段）。
 * 来源是记日志的模块在 src/ 下的路径（与 @server/ 的 import 路径一致、不带扩展名），由模块交进来的 import.meta.url 算出。
 *
 * moduleUrl 传记日志的模块自己的 import.meta.url。
 */
export function createLogger(moduleUrl: string): Logger {
  return root.child({ module: relative(SRC, fileURLToPath(moduleUrl)).replace(/\.ts$/, "") })
}
