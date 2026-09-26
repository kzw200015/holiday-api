import { Hono } from "hono"
import { z } from "zod"

import { signedIn } from "@server/auth/session"
import { historyCursorSchema } from "@server/eh/history-cursor"
import { gidParam, gidSchema, pageSchema, positiveInt32 } from "@server/eh/params"
import * as readingService from "@server/eh/reading.service"
import { galleryTokenSchema } from "@server/eh/upstream/gallery-ref"
import { validate } from "@server/validate"

const gidParams = z.object({ gid: gidParam })

export const readingRoutes = new Hono()
  /*
   * 记下读到第几页。前端不排队、当场发出，同一上报方的两次上报可能乱序到达：
   * writer 是上报方（前端的一次页面加载）的标识，seq 是它的第几次上报，服务端按 seq 只认新的那次；不同上报方之间照到达顺序覆盖
   */
  .post(
    "/progress",
    signedIn,
    validate(
      "json",
      z.object({
        gid: gidSchema,
        token: galleryTokenSchema,
        page: pageSchema,
        writer: z.string({ error: "上报方标识不合法" }).min(1, "上报方标识不合法").max(64, "上报方标识不合法"),
        seq: positiveInt32("上报序号不合法"),
      }),
    ),
    async (c) => {
      await readingService.save(c.get("userId"), c.req.valid("json"))
      return c.body(null, 204)
    },
  )
  /* 这本读到第几页。它不跟详情一起给：详情是上游的元数据，进度是这边高频写、写完就要读到的数据（见 ADR-0006） */
  .get("/progress/:gid", signedIn, validate("param", gidParams), async (c) =>
    c.json(await readingService.progressOf(c.get("userId"), c.req.valid("param").gid)),
  )
  /* 游标由这边编出来、前端原样带回，解开时逐段校验（见 history-cursor.ts） */
  .get("/history", signedIn, validate("query", z.object({ cursor: historyCursorSchema })), async (c) =>
    c.json(await readingService.history(c.get("userId"), c.req.valid("query").cursor)),
  )
  /* 按 gid 认记录，跟表上的唯一约束一致 */
  .delete("/history/:gid", signedIn, validate("param", gidParams), async (c) => {
    await readingService.remove(c.get("userId"), c.req.valid("param").gid)
    return c.body(null, 204)
  })
  .delete("/history", signedIn, async (c) => {
    await readingService.clear(c.get("userId"))
    return c.body(null, 204)
  })
