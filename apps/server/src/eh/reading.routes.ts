import { readingHistoryQuerySchema, readingProgressSchema, type ReadingProgress } from "@myapi/shared/eh"
import { Elysia } from "elysia"
import { z } from "zod"

import { signedIn } from "@server/auth/session"
import { decodeHistoryCursor } from "@server/eh/history-cursor"
import { gidParam } from "@server/eh/params"
import * as readingService from "@server/eh/reading.service"

const gidParams = z.object({ gid: gidParam })

export const readingRoutes = new Elysia()
  .use(signedIn)
  /* 记下读到第几页。前端不排队、当场发出，靠上报方与序号挡住迟到的旧上报 */
  .post(
    "/progress",
    async ({ userId, body }) => {
      await readingService.save(userId, body)
    },
    { body: readingProgressSchema },
  )
  /* 这本读到第几页。它不跟详情一起给：详情是上游的元数据，进度是这边高频写、写完就要读到的数据（见 ADR-0006） */
  .get(
    "/progress/:gid",
    async ({ userId, params }): Promise<ReadingProgress> => ({
      page: await readingService.progressOf(userId, params.gid),
    }),
    { params: gidParams },
  )
  .get("/history", ({ userId, query }) => readingService.history(userId, decodeHistoryCursor(query.cursor)), {
    query: readingHistoryQuerySchema,
  })
  /* 按 gid 认记录，跟表上的唯一约束一致 */
  .delete(
    "/history/:gid",
    async ({ userId, params }) => {
      await readingService.remove(userId, params.gid)
    },
    { params: gidParams },
  )
  .delete("/history", async ({ userId }) => {
    await readingService.clear(userId)
  })
