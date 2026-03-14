import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { internalServerError, notFound } from "@myapi/shared/apiResponse";
import { holidayRouter } from "./holiday/holidayRouter.js";
import { initCurrentAndNextYear } from "./holiday/holidayService.js";
import { logger } from "./logger.js";

const app = new Hono();

/** 全局错误处理，等价于 GlobalExceptionHandler */
app.onError((err, c) => {
  logger.error(err, "未捕获异常");
  return c.json(internalServerError(err.message), 500);
});

/** 挂载节假日路由 */
app.route("/api/holiday", holidayRouter);

/** API 路由 404：未匹配的 /api/* 请求返回统一 JSON 格式 */
app.all("/api/*", (c) => {
  return c.json(notFound(), 404);
});

/** 生产环境：服务前端静态文件（放在 API 路由之后，避免拦截 /api/*） */
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./public" }));
  // SPA fallback：未匹配的非 API 请求返回 index.html
  app.use("/*", serveStatic({ root: "./public", path: "index.html" }));
}

/** 启动初始化：刷新当年和下一年节假日数据 */
await initCurrentAndNextYear();

serve({ fetch: app.fetch, port: 8000 }, (info) => {
  logger.info(`服务已启动: http://localhost:${info.port}`);
});
