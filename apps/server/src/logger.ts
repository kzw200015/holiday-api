/* oxlint-disable no-console -- 这里就是日志的出口，其余代码一律经它记日志 */

/**
 * 按来源分的日志：每行带上时间、级别与来源（模块或类名），写到标准输出与标准错误，由容器收集。
 *
 * 只记给人看的一句话；异常要把原因带进这句话里（或作为第二个参数交出堆栈），不另起一套结构化字段。
 */
export class Logger {
  private readonly context: string

  constructor(context: string) {
    this.context = context
  }

  log(message: string) {
    console.log(this.line("LOG", message))
  }

  debug(message: string) {
    console.debug(this.line("DEBUG", message))
  }

  warn(message: string) {
    console.warn(this.line("WARN", message))
  }

  /** detail 是堆栈或原始错误，另起一行跟在后面。 */
  error(message: string, detail?: unknown) {
    console.error(this.line("ERROR", message), ...(detail === undefined ? [] : [detail]))
  }

  private line(level: string, message: string) {
    return `${new Date().toISOString()} ${level} [${this.context}] ${message}`
  }
}
