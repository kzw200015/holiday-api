# 后端改用 Bun 运行，共享包不再编译

Node 下后端要先经 `nest build` 编译成 JS 才能运行，ESM 又要求导入写全 `.js` 后缀；共享包因此也得先编译到 `dist`，开发时一直 watch。改用 Bun 之后，它直接运行 TypeScript 源码、照 tsconfig 解析路径别名并生成装饰器元数据，这些构建环节都不要了（ADR-0007 换成 Elysia 之后不再用装饰器）。所以后端由 Bun 直接运行 `src/main.ts`，包管理换成 Bun 工作区，共享包改成只有源码的包，能用 Bun 原生 API 的地方用它：密码哈希 `Bun.password`，哈希与 HMAC `Bun.CryptoHasher`，数据库 `Bun.sql`（Drizzle 的 `bun-sql` 驱动），出网用 Bun 的 fetch。库表、旧密码哈希、旧令牌、旧图片签名地址全部保持兼容。

几处取舍：

- **共享包直连源码，推翻 ADR-0003 的「编译成标准工作区包」**：当年反对直连，是因为靠 tsconfig paths 与 vite alias 引用源码，每种工具都要各配一遍别名。现在 `exports` 直接指向 `src/*.ts`，Bun、Vite、vue-tsc、Vitest 都当普通依赖解析，一处别名也不用配。
- **出网的超时自己计，不用 Bun fetch 的 `timeout` 选项**：undici 的 `Agent` 在 Bun 下超时不生效；Bun 的 `timeout` 按套接字算空闲、4 秒一档取整，表达不了「只在调用方来读时计时」。连接阶段约 10 秒的超时靠 Bun fetch 的默认行为（实测，文档未写明）。
- **前端工具链留在 Node**：vue-tsc 要靠 Node 的模块加载改写 TypeScript，在 Bun 下认不出 `.vue`。Bun 只负责装依赖、启动脚本，Vite、vue-tsc、前端的 Vitest 按 shebang 跑在 Node 上。

## Consequences

- 本机与镜像的构建阶段要同时有 Bun 和 Node；镜像的运行时阶段只有 Bun。
- Bun 不做类型检查，后端与共享包的类型错误只有 `bun run typecheck` 能发现，提交前要跑。
- `Bun.sql` 第一次查询就把连接池开满（默认 10 个），生产环境常驻 10 个数据库连接；测试库的连接上限要调高。
- 删掉了 Nest CLI，没有 `nest generate` 一类的代码生成命令。
- 连接阶段的超时依赖 Bun 未写进文档的默认行为，升级 Bun 后要复核。
