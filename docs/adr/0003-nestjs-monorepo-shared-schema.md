# 后端换成 NestJS，前后端组成 monorepo 并共享 zod schema

前端的领域类型靠手工与 Kotlin 后端逐字对齐，后端改了字段名，前端编译照样通过，只能在运行时发现；入参规则（搜索词不超过 200 字节、搜索历史最多 10 条、自动翻页间隔 1–20 秒）前后端各写一份，随时可能漂移。所以后端用 NestJS 重写，仓库改成 pnpm 工作区（ADR-0004 起换成 Bun 工作区）：`apps/server`、`apps/web`，外加 `packages/shared` 放请求的 zod schema 与响应类型。服务端用它校验入参，前端用同一份 schema 在提交前预先挡掉会被退回的内容、从同一个包取响应类型。这是重写而不是移植：Kotlin 版只用来弄清对外行为和 e 站的协议事实，库表、旧密码哈希、旧令牌、旧图片签名地址保持兼容，其余按 Nest 的惯用写法设计。

几处取舍：

- **NestJS 12 而不是 11**：12 自带 `StandardSchemaValidationPipe`，控制器参数上直接挂 zod schema；11 要借第三方的 `nestjs-zod`，它只声明支持到 Nest 11。（后端框架已由 ADR-0007 换成 Elysia，ADR-0008 起是 Hono。）
- **zod 而不是 class-validator**：class-validator 的规则写在类的装饰器上，前端没法原样复用；zod schema 是普通的值，两端都能 import，中文文案也写在 schema 里。
- **共享包编译成标准的工作区包，而不是源码直连加路径别名**。2026-03 做过一次 monorepo，共享代码靠 tsconfig paths 与 vite alias 直接引用源码，每种工具（tsc、Vite、Vitest、Nest 的构建）都要各配一遍别名，配漏一处就是运行时找不到模块，后来退回了。这次共享包用 `tsc` 编译到 `dist`、经 `exports` 暴露，两端都当普通依赖解析，不需要任何别名；代价是改了共享包要先构建，开发时由 `pnpm dev` 一直 watch。（已由 ADR-0004 推翻：`exports` 直接指向源码后各工具都不用配别名，共享包不再编译。）
- **Drizzle 管表结构**：表结构从人工执行 SQL 改为 drizzle-kit 生成迁移、服务启动时自动执行。基线迁移写成幂等的，已有的库只登记不改动。

## Consequences

- 接口契约换成 Nest 的默认结构：去掉 `{code,data,msg}` 外壳，失败体是 `{statusCode, message, error}`；休息日查询接口直接回布尔值，它的外部调用方要跟着改。路径存在但方法不对时回 404 而不是 405。
- 部署环境的环境变量改名（平铺命名，如 `DATABASE_URL`、`SECRET_KEY`），主密钥必须沿用原值，旧令牌与旧图片地址才继续有效。
- 应用的数据库账号要有建表、改表的权限。
- 原来的 ADR-0002（Spring MVC + 虚拟线程）随 Kotlin 版一起作废：Node 下请求本来就是异步的，一个请求里要同时等两件事时用 `Promise.all`。
