import { expect, it } from "vitest"

import { startApp } from "./support/app.js"
import { createDatabase } from "./support/database.js"

/* 拿到一个令牌就能离线猜主密钥，短密钥猜得出来，所以太短时进程拒绝启动。 */
it("主密钥不足 32 字节时拒绝启动", async () => {
  await expect(startApp(await createDatabase(), { env: { SECRET_KEY: "too-short" } })).rejects.toThrow(
    "SECRET_KEY 至少要 32 字节",
  )
})
