# 后端从 NestJS 换成 Elysia，前端经 Eden 从后端推断接口类型

共享包解决了入参规则两端各写一份的问题（ADR-0003），但接口本身仍是手工对齐的：前端的 `api.ts` 按字符串拼路径，响应类型靠 `httpClient.get<GalleryDetail>(…)` 这样的类型参数声明，后端改了路径、改了返回的字段，前端编译照样通过。Nest 的控制器靠装饰器描述路由，类型信息在运行时的元数据里，TypeScript 推不出「这条路径回什么」。所以后端换成 Elysia：路由是一串链式调用，入参 schema 与处理函数的返回值都留在类型里，整个应用导出一个 `App` 类型；前端用 Eden（`@elysia/eden` 的 treaty）按这个类型生成客户端，路径、路径参数、查询串、请求体与响应一律由推断得到，写错当场编译失败。对外行为保持不变：路径、状态码、`{statusCode, message, error}` 的失败体、令牌与图片签名全部兼容，只有 POST 的成功状态码从 201 变成 200（前端与外部调用方都不看它）。

几处取舍：

- **Elysia 而不是 Hono**：Hono 的 `hc` 客户端同样能推断，但 Elysia 的 Eden 是官方的一等公民，入参直接挂 zod（Standard Schema）就进了类型；两者跑在 Bun 上都没有额外代价。
- **按官方的 monorepo 写法：前端 `import type { App }` 直接引后端源码**，不另建声明文件或 project references。前端的 tsconfig 给后端的 `@server/*` 别名配一份同样的解析，`elysia` 作为前端的开发依赖，版本与后端一致。
- **依赖注入改为手工装配**：没有容器，`server.ts` 按启动顺序建连接、刷新节假日数据、建应用，各领域的 `*.routes.ts` 在自己的函数里建好服务再挂路由。服务仍是普通的类，只是构造器参数由调用方传入。
- **鉴权用插件而不是全局守卫**：要登录的一组路由 `use(signedIn(tokens))`，公开的不 use。它用 derive 实现，在入参校验之前执行，没登录的请求先拿到 401。「默认要求登录」不再由框架保证，改由接口测试按整张路由表锁住公开接口的清单。JWT 由 `@nestjs/jwt` 换成 `jose`，令牌格式不变。
- **定时任务用 croner，静态文件自己写**：`@elysiajs/cron` 依赖的 croner 版本太旧；`@elysiajs/static` 会把整份响应缓存在进程里、给 HTML 不带缓存头，而这里只需要「根路径回 index.html、带哈希的文件长期缓存、其余每次回源确认」，二十行就写完。

## Consequences

- 前端的类型检查按前端的配置读到后端源码：后端能被 `App` 类型追到的代码要在两边的配置下都通过。已知的两处约束是 `erasableSyntaxOnly`（不写构造器参数属性，后端 tsconfig 也开着它）与前端 `lib` 只到 ES2022（后端不用 `toSorted` 这类更新的内置方法）。
- 前端的类型检查会看到 Bun 与 Node 的全局类型：`elysia` 自己的声明引用了 `bun`，躲不开。
- Eden 按 schema 的**输出**类型推断请求要传什么：请求体与查询串的 schema 不做 transform，带默认值的字段前端要自己给全。路径参数的 transform（字符串转数字）不受影响。
- 前端只能 `import type` 后端，按值引用会把后端代码连同 drizzle 打进前端。由 lint 挡住：前端引 `@server/**` 只允许 `import type`，并开着 `typescript/no-import-type-side-effects`——前端开着 `verbatimModuleSyntax`，`import { type X }` 编译后会留下一句副作用导入，整个模块照样打进来。
- 共享包里手写的响应 interface 仍由后端的服务用来标注返回类型，前端改从推断取，不再直接引用它们做接口声明。
