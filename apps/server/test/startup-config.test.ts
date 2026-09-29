import { expect, it } from "vitest"

import { startApp } from "./support/app"
import { createDatabase } from "./support/database"

/* 配置写错时进程拒绝启动，并说清是哪一项、该怎么写，而不是带着错的配置跑起来。 */
it("时长写错时拒绝启动", async () => {
  await expect(startApp(await createDatabase(), { env: { EH_REQUEST_TIMEOUT: "30" } })).rejects.toThrow(
    "EH_REQUEST_TIMEOUT: 时长要写成整数加单位",
  )
})
