import pino from "pino"
import pretty from "pino-pretty"
import { config } from "./config"

/**
 * 进程级日志器，各模块直接 import 使用。
 *
 * 输出格式二选一：json（一行一个 JSON 对象，给容器日志采集用）或 pretty（带颜色的可读格式，给终端看）。
 * pretty 用 pino-pretty 的同步流直接接在 pino 上，而不是走 transport：transport 会开 worker 线程，
 * 在 Bun 上不稳定，而且这里只是本地开发看日志，没有异步写入的需求。
 *
 * 记日志的约定：结构化字段放第一个参数的对象里，错误统一用 err 键（pino 会序列化成 message/stack/cause），
 * 消息文案放第二个参数。
 */
export const logger = pino(
  { level: config.log.level },
  config.log.format === "pretty" ? pretty({ sync: true, colorize: true }) : pino.destination({ sync: true }),
)
