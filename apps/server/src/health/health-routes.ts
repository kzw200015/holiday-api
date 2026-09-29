import { sql } from "drizzle-orm"
import { Hono } from "hono"

import { database } from "@server/database/connection"
import { serviceUnavailable } from "@server/http-error"
import { Logger } from "@server/logger"

const logger = new Logger(import.meta.url)

/**
 * 给 Kubernetes 的探针，只看状态码。
 *
 * 端口在迁移与节假日刷新都做完后才开始监听，所以连得上就说明启动完了，启动期的等待交给 startupProbe。
 */
export const healthRoutes = new Hono()
  /*
   * liveness：进程还能处理请求。不碰任何依赖：数据库出故障时重启 Pod 也没用，
   * 所有 Pod 一齐重启、又因为连不上库起不来，只会越重启越糟。
   */
  .get("/live", (c) => c.body(null))
  /*
   * readiness：数据库连得上才接流量，节假日查询离不开它。出网的节假日数据源不算在内，
   * 它出故障时换一个 Pod 也一样。不另设超时，由探针自己的 timeoutSeconds 计。
   */
  .get("/ready", async (c) => {
    try {
      await database.execute(sql`select 1`)
    } catch (error) {
      logger.warn(`数据库连不上：${String(error)}`)
      throw serviceUnavailable("数据库连不上")
    }
    return c.body(null)
  })
