# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

单体应用：`backend`（Bun + TypeScript + Hono + Drizzle ORM，端口 8000）提供 `/api` 接口，`frontend`（Vue 3 + Vite + TypeScript）提供页面。生产镜像里前端产物被放进后端的 `public/`，由同一个 Bun 进程直接提供静态文件。

功能上有三块：本站账号（`auth`）、E-Hentai / ExHentai 第三方只读客户端（`eh`，搜索 → 详情 → 阅读 → 看评论）、节假日查询（`holiday`，接口有外部调用方）。

**启动前必须设 `EH_SECRET_KEY`**（`openssl rand -hex 32` 生成），否则进程直接拒绝启动——登录令牌签名和图片地址签名都由它派生。本地把 `backend/.env.example` 复制成 `.env` 填上即可，`.env` 已被 gitignore 挡住。数据库表不用手动建：进程启动时会先跑 `drizzle/` 下的迁移。

**注册默认关闭**（`ALLOW_REGISTRATION`）。要建第一个账号就临时设成 `true`，注册完改回来重启。这条和「e 站凭据明文入库」是配套的取舍，见下面 `auth` 与 `eh` 两节。

## 常用命令

后端（在 `backend/` 下，包管理器固定为 bun；Bun 直接运行 TS 源码，没有编译产物）：

```bash
bun install
bun run dev                          # 启动后端并监听文件变更，监听 8000
bun start                            # 启动后端（不监听变更）
bun test                             # 跑全部测试
bun test holidayController           # 只跑文件名匹配的测试文件
bun test -t "detail 返回"            # 只跑名称匹配的测试用例（匹配 test() 的中文描述）
bun run typecheck                    # tsc --noEmit；Bun 运行时不做类型检查，提交前手动跑
```

前端（在 `frontend/` 下，包管理器固定为 pnpm）：

```bash
pnpm install
pnpm dev      # 开发服务器，/api 反向代理到 http://localhost:8000
pnpm build    # vue-tsc 类型检查 + vite 构建，产物在 dist/
```

整体镜像构建（多阶段：前端 `pnpm build` → 后端 `bun run typecheck` → 仅装生产依赖的 `oven/bun` 运行时镜像，前端产物拷到 `/app/public`）：

```bash
docker build -t myapi .
```

无 lint 工具链，代码风格由 `.editorconfig`、`pnpm build` 与 `bun run typecheck` 的类型检查约束。安装依赖与构建命令需关闭沙箱执行。本地起后端做冒烟时注意：Bun 的 fetch 不认 `NO_PROXY`，会话里若设了代理环境变量，访问 `localhost` 的请求会被代理吞掉（返回空 503），用 `env -i PATH="$PATH" HOME="$HOME" bun ...` 起干净环境。

## 后端架构

源码根 `src/`，按业务功能分目录（`holiday`、`auth`、`eh`），横切关注点单独分目录（`web`、`crypto`、`db`、`time`、`testing`）。横切目录的分界是**依赖**而不是话题：`web/` 放依赖 Hono 的东西（响应契约、参数校验、访问日志），`crypto/` 放不依赖任何框架的密钥运算（`deriveSecret` 派生子密钥、`attachmentSigner` 签名），`db/` 放 Drizzle 的共用片段。没有依赖注入容器，**依赖注入靠显式定义的 class**：Service、远程客户端、控制器、应用都是 class，依赖用一个对象参数传进构造器、解构后存成 `private readonly` 字段，class 名同时就是对外类型，不另写 interface。`src/index.ts` 是组装根，手工建好 Drizzle 实例、逐层 `new` 出来再传给 `new App(...)`。依赖类型只声明自己用得上的部分（如控制器只依赖 `Pick<HolidayService, "query">`），测试据此直接传假对象——注意 `Pick<>` 挑出来的都是 public 成员，private 字段不参与结构匹配，所以假对象仍然兼容。

**控制器和应用直接 `extends Hono`**：`HolidayController`、`AuthController`、`EhController`、`EhImageController`、`App` 都是 Hono 的子类，构造器里调 `this.get(...)` / `this.use(...)` 注册路由，挂载时 `this.route("/api/xxx", new XxxController(...))` 直接传实例。代价是链式调用的类型推导（Hono 的 RPC 客户端要用）没了，本项目前端走 axios，用不上。

**统一响应契约**：所有接口返回 `ApiResponse { code, data, msg }`，字段顺序即序列化顺序。`app.ts` 里 `app.all("/api/*")` 兜住未匹配的 `/api` 路径返回 JSON 格式的 404，`onError` 把未捕获异常转成同一结构的 500；其余路径找不到静态文件时保持空响应体的 404（前端是哈希路由，静态资源兜底逻辑依赖这一点）。后端 `src/web/apiResponse.ts` 与前端 `src/types/apiResponse.ts` 是一对，改一边要同步另一边。

**唯一的例外是两个图片接口**（`/api/eh/thumbnail` 和 `.../pages/:page/image`），它们直接返回二进制流。

**异常翻译只能写在 `app.onError` 里**：Hono 的 compose 在抛出异常的那一层就把它交给 onError 了，上游中间件的 `await next()` 根本不会 reject，写在中间件里是抓不到的。目前 onError 处理三类：中间件抛的 `HTTPException`（保留自带状态码）、e 站模块的 `EhFailure`（按 `EH_FAILURE_STATUS` 映射）、其余一律 500。

**中间件挂载顺序**（`app.ts`）：`requestLogger` → 各业务子路由 → `/api/*` 兜底 404 → 静态资源。**鉴权绝不能挂在 `app.use("/api/*")` 上**——`GET /api/holiday/is-holiday` 有外部调用方、两个图片接口靠地址签名认身份，挂全局会把这两类一起挡掉；需要登录的接口在各自子路由内部挂 `jwtAuth.middleware`。

**没有 CSRF 中间件**：跨站伪造之所以成立，是因为 Cookie 由浏览器自动带上；身份改走 `Authorization` 头之后，跨站页面既读不到令牌也就冒名不了。`frontend/vite.config.ts` 的代理因此也不再需要改写 `Origin`。

**`/api/eh` 挂了两个控制器，顺序有讲究**：`EhImageController`（`ehImageController.ts`，不要求登录）必须 route 在 `EhController`（`ehController.ts`，要求登录）之前，两者前缀相同，反过来的话图片请求会先撞上 JWT 中间件。分成两个 class、两个文件而不是在一个里面挑几条豁免，是为了让「哪些接口不需要登录」一眼可见。两者共用的入参校验（`galleryRefSchema`、`galleryPageSchema`）放在 `ehModels.ts` 里挨着 `GalleryRef`——谁 import 谁都别扭，索性都不放控制器里。

**节假日模块分层**：`holidayController.ts`（Hono 子路由，参数校验用 `web/apiValidator.ts` 包过的 zod，失败统一回 `ApiResponse` 结构的 400）→ `HolidayService`（业务判断，同时直接写查询条件与存储约定，没有单独的数据访问层）→ Drizzle（`holidayModels.ts` 里的 `pgTable` 声明，驱动为 Bun 内置 `bun:sql`）。

几个已在注释中固化的约束，修改时不要推翻：

- `GET /api/holiday/is-holiday` 有外部调用方，响应体 `data` 固定为 boolean。
- 日期有两种表示，规则在 `time/date.ts`：数据库列和接口出入参用 `YYYY-MM-DD` 字符串（`IsoDate`）；HTTP 入口校验时用 `calendarDateSchema` 一次性解析成 `@internationalized/date` 的 `CalendarDate`（只有年月日、无时区，等价于原来的 `LocalDate`，前端日历组件也用这个库），业务层按对象传递，落库或写响应体时 `toString()` 转回字符串，不用原生 `Date`。格式规则只有一份 `isoDateSchema`（`z.iso.date()`，严格位数 + 日历合法性），远程 JSON 也用它校验；解析只走 `parseDate`，不要手写 `new CalendarDate(...)`（会静默钳位）。控制器的 `date` 参数省略或空串取当天，校验失败的文案固定为「日期格式错误，应为 YYYY-MM-DD」。
- `date` 列存 `YYYY-MM-DD` 字符串，年份即前缀，`refreshYear` 靠 `like(date, "YYYY-%")` 删旧数据。该列有唯一索引 `holiday_days_date_key`，`query` 因此 `limit(2)` 后多行即抛，而不是静默取第一条。
- `refreshYear` 用 `db.transaction` 包住「先删后插」，回调抛错即回滚；插入是单条多行 `INSERT`，`values([])` 会被 Drizzle 拒绝，所以远程为空时只删不插（2027 年数据未发布前就是这种情况）。
- 远程拉取放在事务外，不让最长 60 秒的 HTTP 调用占着数据库连接；远程响应用 zod 校验结构后才入库。

**账号与鉴权（`auth`）**：登录后签发 **JWT**（`hono/jwt`，HS256，载荷 `{ sub: userId, exp }`），前端存 localStorage、每个请求放进 `Authorization: Bearer`。没有 sessions 表，服务端也不存已签发的令牌，所以**踢不了人，只能等过期**（真要做就加一列 `users.token_epoch` 签进载荷，代价是每次校验都要查库）。**签发和校验都写死 `HS256`**，不看令牌头里的 `alg`——照令牌自称的算法去验等于让攻击者自己挑锁。也因此**没有 logout 接口**：退出就是前端把令牌丢掉，留一个只回 200 的空接口反而会让人误以为服务端真作废了它。密码用 Bun 内置 `Bun.password`（argon2id），零依赖。

**注册开关 `ALLOW_REGISTRATION` 默认关**，只有显式设成 `"true"` 才开。公网部署时任何人注册即可借这台机器代理 e 站流量，被封的是本机出口 IP；而且 e 站凭据现在是明文入库的，账号越少、越都是自己人，那个取舍才成立。没有留「第一个账号自动放行」之类的后门——建号就是临时开一下开关、注册、关回去重启，多这两步换掉一条永远开着的旁路。

**图片走签名地址而不是令牌**（`crypto/attachmentSigner.ts`）：`<img src>` 是浏览器自己发的请求，带不了 `Authorization` 头。所以两个图片接口不鉴权，只认地址里的签名——签名覆盖「这是哪一份附件」加过期时间，两者任一被改就对不上。缩略图签的是上游地址，大图签的是 `userId:gid:token`：**页码刻意不参与签名**，一本图集一张通行证，否则 300 页的详情就得回传 300 条签好的地址；地址模板由 `GET /api/eh/galleries/:gid/:token` 随详情下发，形如 `.../pages/{page}/image?uid=&e=&s=`，前端只把 `{page}` 换成页码。**大图的 userId 只能取自签名过的 `uid` 参数**，不能取当前登录者——那条链路根本没有登录者。有效期由 `ATTACHMENT_TTL_MS` 控制（默认 24 小时），过期表现为图片裂开，重新取一次详情即可；签名不对或过期回 **403**（`EhFailure` 的 `badSignature`）而不是 502——过期是有效期到点后的日常现象，混进 502 会把「e 站真的挂了」的信号淹掉。缩略图地址在**组装响应时**才签名，不进 `galleryCache`，否则缓存 TTL 就得永远短于附件有效期。`ehSignedUrl.test.ts` 专门测这个闭环：签发和校验各拼一次 subject，两边不一致的话所有图片会一起打不开，而各自的单元测试都是绿的。

**e 站模块（`eh`）分层**：`ehController` / `ehImageController`（校验 `gid` 正整数、`token` 为 10 位十六进制——这两项会被拼进上游地址）→ `ehService`（对外门面：编排用例、元数据缓存、附件地址的签发与校验）→ `ehClient`（统一 fetch：伪装 UA、带固定 Cookie、超时、异常翻译）。

`ehService` 底下还挂着两块自带状态的协作者，都在 `index.ts` 里 `new` 好注入进去：

- **`EhCredentialStore`（`ehCredentials.ts`）**：凭据入库、取出、按有没有里站权限决定这次请求走前站还是里站。它那三个接口在 `EhService` 上只是原样转交——控制器只认门面一个依赖，模块内部怎么分工不往外泄。
- **`EhImageLocator`（`ehImageLocator.ts`）**：「第 N 页的图片地址是什么」这条链路，连同它那五张缓存表和在途请求去重表。对外只有两个方法：`resolve(ctx, ref, page, { reload })` 拿地址（`reload` 用于图床失效后换源，它绕开所有缓存），`absorbGalleryPage` 收下详情页 HTML 里顺带带来的每页令牌。

出网没有限速也没有熔断——刻意去掉的，代价是请求节奏不再受控，出口 IP 更容易被 e 站盯上。`ehParser` 是纯函数层，配 `__fixtures__/` 里从真实页面裁下来的样本单测。

几条已在注释里固化的取舍：

- **能走 JSON API 的一律不解析 HTML**。标题、标签、分类、总页数全部来自 `gdata`，只有三样东西非 HTML 不可：列表页的图集序列、详情页的每页令牌与评论、图片页的 showkey。
- **详情页的令牌和评论分成两个解析函数**（`parseGalleryPage` / `parseGalleryComments`）。取图链路每翻一片就要走一次前者，而它不需要评论；cheerio 的 `load()` 对一页 74 KB 的详情页要同步阻塞 3 毫秒，正则版 0.01 毫秒，而那 3 毫秒正卡在有几十路图片在转发的事件循环上。
- **正则捕获出来的短字符串进缓存前必须 `detach()`**（`ehParser` 里那个 Buffer 往返）。JavaScriptCore 的正则捕获是共享父串缓冲区的子串，直接存进 20~30 分钟 TTL 的缓存会把整页 HTML 一起钉在内存里——实测 300 条 46 字符的捕获占了 32 MB。`(s + " ").slice(0, -1)` 这类写法实测断不开。
- **列表页用正则全文抓 `/g/<gid>/<token>/`**，不挑 `td.gl3c.glname` 这类选择器：搜索结果有 5 种显示模式且由账号设置决定，Thumbnail 模式下整个 `<table>` 都不存在。请求固定带 `sl=dm_2` 作为双保险。
- **请求固定带 `nw=1`**。被标记的图集在没有这个 cookie 时会返回 HTTP 200 的内容警告插页，正文里既没有 `#gdt` 也没有 `#cdiv`，不设防会静默返回空数据。
- **四种「200 但不是你要的东西」必须识别**（`classifyResponse`）：内容警告插页、sad panda（里站回 200 + 空 body）、IP 被封（200 的纯文本页）、509 配额超限。四种各自抛出对应的 `EhFailure`，由 `app.onError` 翻成状态码；后两种以前还会触发熔断停手 10 分钟，熔断随限流器一起删掉了（见下一条），现在撞上封禁也不会自动停手。
- **出网不限速、不熔断**。曾经有过一个三通道的限流器（html 串行 + 秒级间隔、api 令牌桶、image 只限并发）和识别到封禁后停手 10 分钟的熔断，后来按需求整体删掉了。现在所有上游请求直接发出去，也不会因为撞上封禁而停手。要加回来的话，加在 `ehClient` 的 `request` 外面一层，而不是散到各个调用点。
- **取图链路**：每页令牌 → showkey → `showpage` 接口。**`showpage` 的响应里白送了下一页的令牌**，顺序阅读时顺手写回缓存，所以一本 300 页的图集只需要 2 次 HTML 请求（首页详情 + 首张 `/s/` 页），之后每页只有 1 次轻量 API 调用，只有跳页才会回头抓详情页分片。showkey 失效（`{"error":"Key mismatch"}`）时重抓 `/s/` 页换新的，**只重试一次**。图床节点失效表现为图片 403，用页面里的 `nl` 令牌换源重取一次。
- **一张缓存表都不建**：图集元数据在 `ehService`，每页令牌、showkey、换源令牌、解析出的图片地址在 `ehImageLocator`，解密过的凭据在 `ehCredentials`，全是进程内的 `TtlCache`（`eh/ehCache.ts`）。这些数据都能重新拉，为可重建的东西加表、加迁移、加运维负担不值。
- **缩略图代理用 HMAC 签名地址**，端点只认自己签发过的 URL，客户端指定不了主机。白名单（精确匹配 `ehgt.org`、后缀 `.hath.network`，注意那个点不能省）、`redirect: "manual"`、`Content-Type` 必须 `image/` 是纵深防御，别放宽。
- **`f_cats` 传的是要排除的分类位和**，方向极易写反；全不选和全选都要省略这个参数（按公式算全不选会得到 1023，那是「全部排除」）。换算封在 `ehCategory.ts` 的 `toCategoryFilter` 里，接口和前端只用分类名。分类名的唯一来源是同文件的 `CATEGORY_NAMES`，控制器拿它做 `z.enum` 校验——不校验的话前端拼错名字只会让那一位算成 0，表现是「筛选点了但结果没变」，查不出来。
- **e 站 Cookie 明文入库**（`eh_credentials.cookie`，JSON 文本）。曾经用 AES-GCM 加密，后来按需求去掉了：加密防的是「库漏了但主密钥没漏」那一类场景（备份文件、只读账号、SQL 注入、从库），关掉公开注册之后库里只有自己人的凭据，这层就不划算了。代价要认清——**那一列等同于 e 站账号本身**，拿到就能登进去，所以数据库备份、从库、监控查询都要按凭据的标准对待。读的时候**不做「解析不出来就当未绑定」的兜底**：那一列只由 `bind()` 写入，真解析不出来说明有人手工改过库，让它抛出去比静默显示成「未绑定」好查得多。要加回来的话，加解密都在 `ehCredentials.ts` 一处，再补一把 `eh-cookie-v1` 子密钥即可。
- 主密钥按用途派生子密钥（`crypto/deriveSecret.ts`）：JWT 签名（`jwt-v1`）和图片地址签名（`attachment-v1`）各用各的，不共用裸密钥。改用途标签等于换密钥，已签发的令牌和已发出去的图片地址会一起失效。

**启动依赖与定时刷新**：`src/index.ts` 在监听端口之前调用 `refreshUpcomingYears()` 并行拉取当年和次年数据，任一失败即以未处理的 rejection 退出进程。因此本地跑后端需要能连上 PostgreSQL 且能访问 `raw.githubusercontent.com`。启动后 `setInterval` 按 `config.holiday.refreshIntervalMs`（默认 24 小时）重复同一刷新，年份每次重新计算所以跨年不用重启；定时刷新失败只记日志不退出，库里已有数据可继续服务。默认配置都在 `src/config.ts`，部署时用同名环境变量覆盖：`DATABASE_URL` / `PORT` / `STATIC_DIR` / `HOLIDAY_REFRESH_INTERVAL_MS` / `LOG_LEVEL` / `LOG_FORMAT`，以及 `EH_SECRET_KEY`（**必填**）/ `ALLOW_REGISTRATION`（默认关）/ `TOKEN_TTL_MS` / `ATTACHMENT_TTL_MS` / `EH_USER_AGENT` / `EH_REQUEST_TIMEOUT_MS`。

**数据库迁移**：`*Models.ts` 是 schema 的唯一真相，迁移由 drizzle-kit 生成、由进程启动时应用。

```bash
bun run db:generate     # 改完模型后跑，把 diff 写成 drizzle/ 下的 SQL（drizzle-kit 是开发依赖）
bunx drizzle-kit check  # 检查迁移文件之间有没有冲突
```

生成的 `drizzle/*.sql` 和 `drizzle/meta/` **要入库**，别手改；`src/index.ts` 在监听端口之前调 `migrate()` 应用它们（用 `drizzle-orm/bun-sql/migrator`，只依赖运行时那个包，所以生产镜像不装 drizzle-kit）。drizzle 自己记录已应用的版本并加锁，重复启动是安全的；迁移失败即退出，不会带着不完整的表结构对外服务。

**因此模型必须声明表的完整结构**——列、索引、外键一个都不能少。drizzle-kit 把模型当唯一真相，模型里没写的东西它会当成多余的并生成删除语句。这条推翻了以前「pgTable 只声明代码会读写的列」的做法。

**建表约定（每张表都要遵守）**：

- **`id`、`created_at`、`updated_at` 三列一张不少**。`id` 用 `.generatedByDefaultAsIdentity()`（SQL 标准的 identity），不用旧式的 `serial`。
- **时间由应用层写**，数据库上这两列既没有 `default` 也没有触发器 —— 漏写会直接报错，而不是悄悄落一个别处填的时间。值统一来自 `src/db/timestamps.ts` 的 `timestamps`，往 `pgTable` 里展开一次即可：插入走 Drizzle 的 `$defaultFn`、更新走 `$onUpdate`，**连 upsert 的 `on conflict do update set` 也会自动带上 `updated_at`**（实测确认），所以调用处一律不用手写时间。
- **业务上的唯一性用 unique 索引表达，不占主键位置**：主键统一是 `id`。`eh_credentials.user_id`、`eh_reading_progress.(user_id, gid)` 都是唯一索引，同时也是各自 upsert 的冲突目标。
- **用户名大小写敏感**：`Alice` 和 `alice` 是两个账号，登录要求完全一致。`users_username_key` 因此是建在 `username` 上的普通唯一索引，查询用 `eq()` 即可。（曾经建在 `lower(username)` 上做大小写不敏感，后来按需求改掉了；真要改回去，索引和查询必须用同一个表达式，否则查询走不到索引、退化成全表扫。）
- `HolidayDay` 从表结构里 `Pick` 出三列而不是直接用整行：这个名字同时是「远程 JSON 的元素结构」和「detail 接口的响应体」，而 `id` 和两个时间列只属于「表的一行」。挑列的写法让列改名的报错落在类型定义那一行，而不是散到调用处。
- `drizzle.config.ts` 由 drizzle-kit 用 **Node** 加载，不是 Bun，所以别在里面 import `src/config`（那边用了 `import.meta.dir` 这类 Bun 专有 API）。也别设 `casing`——运行时的 `drizzle()` 没设，两边不一致会让生成的 SQL 和实际查询对不上。

`Bun.serve` 显式设了 `idleTimeout: 60`（默认 10 秒），否则从慢的 H@H 节点流式转发大图会被掐断。

**日志**：用 pino，`src/logger.ts` 导出进程级单例 `logger`，各模块直接 import，不写 `console.*`。写法固定为 `logger.info({ 结构化字段 }, "消息")`，错误放在 `err` 键（pino 自带序列化）。格式默认按 stdout 是否终端自动选：终端 pretty（pino-pretty 同步流，不走 transport 的 worker 线程，Bun 上更稳），容器 json；`bun test` 下默认静音。`web/requestLogger.ts` 只挂在 `/api/*` 上记访问日志（方法、路径、状态码、耗时），静态资源不记；两个图片接口成功时降到 debug（由那两条路由自己 `c.set("quietAccessLog", true)` 声明，中间件不认识具体业务路径），否则一次阅读几十个请求就把日志冲没了。注意别改成在 `EhImageController` 里 `use("*")`：两个 eh 控制器挂在同一前缀下，子应用的 `use("*")` 会罩住整个 `/api/eh/*`。`ehClient` 对每个上游请求也记一条 debug，排查「一次操作到底打了几个上游请求」全靠它。

**测试**：`bun:test`，测试文件与源码同目录（`*.test.ts`）。控制器测试用 `testing/testApp.ts` 的 `createTestApp(overrides)` 组装应用，它返回 `{ app, mocks }`：所有依赖先补成签名正确的空 mock，用例从 `mocks` 里取出自己关心的那几个来配置和断言，方法名单因此只在 `App` 的构造器参数类型里存一份（`ConstructorParameters<typeof App>[0]`）。想拿真实实现测某条链路时用 `createTestApp({ ehService: 真实实例 })` 覆盖掉对应的 mock，`ehSignedUrl.test.ts` 就是这么做的。同文件还导出 `testUser` 和 `loginAsTestUser`（返回 `{ Authorization }`，直接展开进 headers），需要登录态的测试别再各造一份。通过 `app.request()` 走完整处理链，断言直接比对完整 JSON 字符串，所以响应字段顺序变化会导致测试失败。

除控制器外还有两类值得单独测的纯逻辑：`ehParser`（用 `__fixtures__/` 里从真实页面裁下来的样本，这是最容易被 e 站改版打破的一层），以及两处安全边界——`isAllowedImageUrl`、`AttachmentSigner`。重新采样 fixture 时保持同样的裁剪方式：结构特征要真实，体积要小。

## 前端架构

**组件一律用 TSX 写**（`defineComponent` + `setup` 返回渲染函数），不写 `.vue` 单文件组件 —— `src/components/ui/` 下的 `.vue` 是 shadcn-vue 生成的产物，属于可直接修改的项目源码，但新增业务组件请沿用 TSX。JSX 支持来自 `@vitejs/plugin-vue-jsx`。

目录职责：`views/`（页面）、`layouts/`（应用外壳与侧边栏）、`api/`（接口封装）、`stores/`（Pinia）、`components/ui/`（shadcn-vue 组件）。`@` 别名指向 `src`。

**路由与导航的单一来源**：路由表 `router/index.ts` 的 `meta.title` 是页面名称的唯一定义处，顶栏标题与侧边栏文案都从这里取；`layouts/navigation.ts` 只声明「哪些路由进侧边栏、用什么图标」。新增页面 = 加一条路由记录（含 `meta.title`），需要进侧边栏再往 `navigationItems` 追加一项。使用哈希路由（`createWebHashHistory`）。

`meta.requiresAuth` 决定 `beforeEach` 拦不拦；首页和节假日页保持公开。登录页和阅读视图是**顶层路由**（与 `/` 布局平级），因为它们要全屏、不套 `AppLayout`。

**列表状态放 store 而不是 KeepAlive**：`stores/GalleryListStore.ts` 存已加载的条目和游标。用过 KeepAlive，但阅读视图是顶层路由，进去时整个 `AppLayout` 连同里面的 KeepAlive 一起卸载，缓存就没了；放 store 则无论从哪条路径回来都还在，配合路由的 `scrollBehavior`（`savedPosition`）就能接着往下翻。

**HTTP 层**：`api/httpClient.ts` 的 axios 响应拦截器已把 `response.data` 解包，并把错误统一转成携带后端 `msg` 的 `Error`。业务侧只写 `api/xxx.ts` 里的具名函数，不要直接用 axios。401 的跳转处理由 `main.ts` 用 `onUnauthorized()` 注入，**不要在 httpClient 里直接 import router**——router 会加载各个页面、页面又 import httpClient，直接依赖就成环了。

**登录令牌存 localStorage**（`api/httpClient.ts`）：请求拦截器统一加 `Authorization: Bearer`，401 时顺手清掉本地令牌再交给 `onUnauthorized()` 跳转。退出登录没有后端往返，就是 `setToken("")`。

**图片地址不要自己拼**：缩略图地址由后端签好放在 `thumbnail` 字段里；大图要先从 `fetchGalleryDetail` 拿 `imageUrlTemplate`，再交给 `galleryImageUrl(template, page)` 把 `{page}` 换掉——这两条地址的身份都签在里面，前端改动其中任何一部分都会让签名失效。预取和正式显示必须拼出完全一样的地址，否则命不中同一份浏览器缓存。

**shadcn-vue 组件不声明原生属性**：`disabled`、`type`、`placeholder`、`autocomplete` 这些要走展开语法 `{...{ disabled: x }}` 才能透传给根元素，直接写成 JSX 属性过不了类型检查。

**主题**：暗色用 `html.dark` class 策略（`styles/index.css` 里的 `@custom-variant dark` 覆盖了 Tailwind 4 默认的媒体查询策略），由 `AppStore` 统一切换，并同步 `meta[name=theme-color]`。主题初始化在 `main.ts` 挂载前执行，避免首帧闪白。

**Tailwind 4**：无 `tailwind.config`，主题变量全部写在 `styles/index.css` 的 `@theme` / `@theme inline` 中。`.vscode/settings.json` 已把 `.css` 关联到 tailwindcss 语言模式并声明 `cn`/`cva` 为类名函数。

## 语言约定

代码注释、提交信息与文档一律用简体中文。注释写「为什么这么做」而非复述代码，现有代码里的取舍说明（事务边界、日期表示方式、CSS 覆盖原因等）是主要的上下文来源，改动相关代码时同步更新。

**标识符一律用英文**，常规 camelCase。`bun:test` 的 `test()` 名称是普通字符串而非标识符，直接写中文描述（`bun test -t` 按它过滤）。

## Agent skills

### Issue tracker

问题与规格以 Markdown 文件形式存放在 `.scratch/` 下。详见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用五个标准角色的默认标签字符串。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。
