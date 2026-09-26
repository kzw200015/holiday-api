import { Elysia } from "elysia"
import { z } from "zod"

import { signedIn } from "@server/auth/session"
import { decodeHistoryCursor, INVALID_HISTORY_CURSOR } from "@server/eh/history-cursor"
import { gidParam, gidSchema, pageSchema, positiveInt32 } from "@server/eh/params"
import * as readingService from "@server/eh/reading.service"
import { galleryTokenSchema } from "@server/eh/upstream/gallery-ref"

const gidParams = z.object({ gid: gidParam })

export const readingRoutes = new Elysia()
  .use(signedIn)
  /*
   * 记下读到第几页。前端不排队、当场发出，同一上报方的两次上报可能乱序到达：
   * writer 是上报方（前端的一次页面加载）的标识，seq 是它的第几次上报，服务端按 seq 只认新的那次；不同上报方之间照到达顺序覆盖
   */
  .post("/progress", ({ userId, body }) => readingService.save(userId, body), {
    body: z.object({
      gid: gidSchema,
      token: galleryTokenSchema,
      page: pageSchema,
      writer: z.string({ error: "上报方标识不合法" }).min(1, "上报方标识不合法").max(64, "上报方标识不合法"),
      seq: positiveInt32("上报序号不合法"),
    }),
  })
  /* 这本读到第几页。它不跟详情一起给：详情是上游的元数据，进度是这边高频写、写完就要读到的数据（见 ADR-0006） */
  .get("/progress/:gid", ({ userId, params }) => readingService.progressOf(userId, params.gid), { params: gidParams })
  /* 游标由这边编出来、前端原样带回，解开时逐段校验（见 history-cursor.ts） */
  .get("/history", ({ userId, query }) => readingService.history(userId, decodeHistoryCursor(query.cursor)), {
    query: z.object({ cursor: z.string({ error: INVALID_HISTORY_CURSOR }).default("") }),
  })
  /* 按 gid 认记录，跟表上的唯一约束一致 */
  .delete("/history/:gid", ({ userId, params }) => readingService.remove(userId, params.gid), { params: gidParams })
  .delete("/history", ({ userId }) => readingService.clear(userId))
