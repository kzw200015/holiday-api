import { Controller, Get, Inject, Logger, ServiceUnavailableException } from "@nestjs/common"
import { sql } from "drizzle-orm"

import { Public } from "@/auth/auth.decorators"
import { DATABASE, type Database } from "@/database/database.module"

/**
 * 给 Kubernetes 的探针，不要求登录，只看状态码。
 *
 * 端口在迁移与节假日刷新都做完后才开始监听，所以连得上就说明启动完了，启动期的等待交给 startupProbe。
 */
@Public()
@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * liveness：进程还能处理请求。不碰任何依赖：数据库出故障时重启 Pod 也没用，
   * 所有 Pod 一齐重启、又因为连不上库起不来，只会越重启越糟。
   */
  @Get("live")
  live(): void {}

  /**
   * readiness：数据库连得上才接流量，本站的功能都离不开它。出网的 e 站与节假日数据源不算在内，
   * 它们出故障时换一个 Pod 也一样。不另设超时，由探针自己的 timeoutSeconds 计。
   */
  @Get("ready")
  async ready(): Promise<void> {
    try {
      await this.database.execute(sql`select 1`)
    } catch (error) {
      this.logger.warn(`数据库连不上：${String(error)}`)
      throw new ServiceUnavailableException("数据库连不上")
    }
  }
}
