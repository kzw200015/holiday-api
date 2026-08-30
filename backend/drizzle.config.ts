import { defineConfig } from "drizzle-kit"

/**
 * drizzle-kit 的配置，只在开发期用来生成迁移文件：
 *
 *   bun run db:generate   改完 *Models.ts 后跑，把 diff 写成 drizzle/ 下的 SQL
 *
 * 迁移的**应用**不走 drizzle-kit，而是进程启动时由 src/index.ts 调 migrate() 完成，
 * 那条路径只依赖 drizzle-orm，所以生产镜像里不需要装 drizzle-kit，这里也就不配连接串
 *（要用 drizzle-kit studio / push 这类需要连库的命令，临时补一个 dbCredentials 即可）。
 *
 * 注意：模型现在必须声明表的全部结构（列、索引、外键）。drizzle-kit 把模型当作唯一真相，
 * 模型里没写的东西它会认为是多余的并生成删除语句。
 *
 * 这个文件由 drizzle-kit 用 Node 加载，不是 Bun，所以别在这里 import src/config——
 * 那边用了 import.meta.dir 这类 Bun 专有 API，在 Node 下是 undefined。
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/**/*Models.ts",
  out: "./drizzle",
  // 不设 casing：运行时的 drizzle() 也没设，两边必须一致，
  // 否则生成的 SQL 和实际发出的查询会对不上。多词列名一律在模型里显式写死
})
