# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

单体应用：`backend`（Go + chi + sqlc + pgx + wire + viper，端口 8000）提供 `/api` 接口，`frontend`（Vue 3 + Vite + TypeScript）提供页面。生产镜像里前端产物被放进后端可执行文件旁边的 `public/`，由同一个进程直接提供静态文件。

功能上有三块：本站账号（`auth`）、E-Hentai / ExHentai 第三方只读客户端（`eh`，搜索 → 详情 → 阅读 → 看评论）、节假日查询（`holiday`，接口有外部调用方）。

**启动前必须配好密钥**（`openssl rand -hex 32` 生成），否则进程直接拒绝启动——登录令牌签名和图片地址签名都由它派生。本地把 `backend/config.example.yml` 复制成 `config.yml` 填上 `security.secretKey` 即可，`config.yml` 已被 gitignore 挡住；容器里则用环境变量 `SECRET_KEY`。表结构由人工维护：进程不碰 DDL，建表用 `backend/internal/store/schema.sql` 里的语句自己上库执行。

**注册默认关闭**（`ALLOW_REGISTRATION`）。要建第一个账号就临时设成 `true`，注册完改回来重启。这条和「e 站凭据明文入库」是配套的取舍，见下面 `auth` 与 `eh` 两节。

## 常用命令

后端（在 `backend/` 下）：

```bash
go run ./cmd/myapi          # 启动后端，监听 8000
go build ./...              # 编译即类型检查，提交前跑一次
go vet ./...                # 静态检查
gofmt -l .                  # 列出没格式化的文件，应当没有输出
go test ./...               # 跑全部测试
go test ./internal/eh/ -run TestParseGalleryList -v   # 只跑某个用例

sqlc generate               # 改完 internal/store/{schema,query}.sql 后重新生成数据访问代码
wire ./cmd/myapi            # 改完依赖图（cmd/myapi/wire.go）后重新生成 wire_gen.go
```

`sqlc` 和 `wire` 是开发期工具，不进运行镜像，用 `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest` 和 `go install github.com/google/wire/cmd/wire@latest` 装。两者都要求 CLI 的构建版本不低于 `go list` 的版本，Go 升级后要重装一次，否则报「package requires newer Go version」。

前端（在 `frontend/` 下，包管理器固定为 pnpm）：

```bash
pnpm install
pnpm dev      # 开发服务器，/api 反向代理到 http://localhost:8000
pnpm build    # vue-tsc 类型检查 + vite 构建，产物在 dist/
```

整体镜像构建（多阶段：前端 `pnpm build` → `go build` 出静态二进制 → alpine 运行时，前端产物拷到 `/app/public`）：

```bash
docker build -t myapi .
```

无 lint 工具链，代码风格由 `.editorconfig`、`gofmt` 与编译器约束。安装依赖与构建命令需关闭沙箱执行。

## 后端架构

模块名是 `myapi`，入口在 `cmd/myapi/`，其余代码全在 `internal/` 下，按业务功能分包（`holiday`、`auth`、`eh`），横切关注点单独分包（`web`、`signing`、`store`、`app`、`config`）。横切包的分界是**依赖**而不是话题：`web/` 放依赖 `net/http` 的东西（响应契约、错误翻译、访问日志、静态资源），`signing/` 放不依赖任何框架的密钥运算（`DeriveSecret` 派生子密钥、`AttachmentSigner` 签名），`store/` 放 SQL 与 sqlc 生成的数据访问代码。

**依赖注入用 wire**：`cmd/myapi/wire.go`（带 `wireinject` 构建标签）声明依赖图，`wire` 生成 `cmd/myapi/wire_gen.go`。两个文件都要入库，`wire_gen.go` 不要手改。各包只导出普通构造器（`eh.NewService(...)` 之类），需要从 `config.Config` 里挑字段的地方写成 `cmd/myapi/providers.go` 里的小 provider 函数——这样每个构造器只声明自己真正用得上的东西，也不必让业务包认识 `config`。

**读配置、建日志器、建连接池也都在图里**，injector 是 `initApplication(ctx) (*application, func(), error)`，`main` 因此只剩「组装 → 刷新节假日 → 监听」三步。两个值得注意的地方：

- **连接池的关闭走 wire 的 cleanup**（`provideDatabase` 返回 `(*pgxpool.Pool, func(), error)`）。wire 把图里所有 cleanup 串成 injector 交出来的那一个，后面哪个 provider 失败也会被调到，池子不会漏。
- **`provideLogger` 会 `slog.SetDefault`，并且 `provideDatabase` 收一个 `*slog.Logger` 参数**。那个参数是真用（连接池就绪时打一条日志），顺带让「日志先就绪、再连库」由依赖关系保证，而不是靠 `main` 里的语句先后——这比制造一个假依赖去排顺序干净。

**处理器返回 error，翻译统一在一处**（`web/response.go`）：路由注册的是 `web.Handler`（`func(http.ResponseWriter, *http.Request) error`），它的 `ServeHTTP` 把 `*web.Error` 翻成对应状态码的 `ApiResponse`，其余错误一律 500。业务代码因此可以放心地把错误一路 `return` 上来，不用在每个处理器里各写一遍 `http.Error`。

**没有「失败种类 → 状态码」的映射表**：`web.Error` 直接带 `Status` 和给人看的 `Msg`，e 站那些可预期的失败在 `eh/failure.go` 里各写一个构造函数（`errBanned()` 回 429、`errSadPanda()` 回 400、`errBadSignature()` 回 403……），抛错的地方就说清楚回什么。

**统一响应契约**：所有接口返回 `web.Response { code, data, msg }`，**结构体的字段声明顺序即 JSON 序列化顺序**。**会进响应体的切片一律用 `[]T{}` 而不是 `var x []T`**——nil 切片序列化出来是 `null` 而不是 `[]`，前端照着数组遍历就炸；不进 JSON 的切片则相反，`var` 更好。IDE 会建议把前者也改成 `var`，别接受。`/api` 子路由的 `NotFound` 和 `MethodNotAllowed` 都指向 `web.NotFound`，未匹配的 `/api` 路径统一回 JSON 404；其余路径找不到静态文件时保持空响应体的 404（前端是哈希路由，静态资源兜底逻辑依赖这一点）。后端 `internal/web/response.go` 与前端 `src/types/apiResponse.ts` 是一对，改一边要同步另一边。

**唯一的例外是两个图片接口**（`/api/eh/thumbnail` 和 `.../pages/{page}/image`），它们直接返回二进制流。

**路由组装在 `internal/app/app.go`**：`/api` 子路由挂访问日志，底下 `Mount` 三个模块。**鉴权绝不能挂在整个 `/api` 上**——`GET /api/holiday/is-holiday` 有外部调用方、两个图片接口靠地址签名认身份，挂全局会把这两类一起挡掉；需要登录的接口在各自模块的子路由里挂 `auth.Tokens.Require`。

**没有 CSRF 中间件**：跨站伪造之所以成立，是因为 Cookie 由浏览器自动带上；身份改走 `Authorization` 头之后，跨站页面既读不到令牌也就冒名不了。`frontend/vite.config.ts` 的代理因此也不需要改写 `Origin`。

**`/api/eh` 下分成两组路由**（`eh/handler.go` 与 `eh/handler_image.go`）：图片那两条用 `chi.Router.Group` 单独开一组、**不挂鉴权**，其余的那组挂 `Require`。分成两个文件而不是在一处挑几条豁免，是为了让「哪些接口不需要登录」一眼可见——混在一起的话，日后加接口时很容易顺手加到不设防的那一侧。

**日志用标准库 `log/slog`**：`cmd/myapi/main.go` 建好 handler 后 `slog.SetDefault`，各包直接调 `slog.Info(...)`，不写 `fmt.Println`。写法固定为 `slog.Info("消息", "字段名", 值, ...)`，错误统一放在 `err` 键。格式默认按 stdout 是否终端自动选：终端 `text`，容器 `json`。`web.RequestLogger` 只挂在 `/api` 下记访问日志（方法、路径、状态码、耗时），静态资源不记；两个图片接口成功时降到 debug（那一组路由挂了 `web.Quiet` 中间件，通用设施不认识具体业务路径），否则一次阅读几十个请求就把日志冲没了。`eh.Client` 对每个上游请求也记一条 debug，排查「一次操作到底打了几个上游请求」全靠它。

**节假日模块分层**：`holiday/handler.go`（chi 子路由，`date` 参数省略或空串取当天，格式校验直接靠 `time.Parse("2006-01-02", ...)`——它对位数是严格的，也会拒绝日历上不存在的日期，不用再写一套校验）→ `holiday.Service`（业务判断，同时直接写查询条件与存储约定，没有单独的数据访问层）→ sqlc 生成的查询。

几个已在注释中固化的约束，修改时不要推翻：

- `GET /api/holiday/is-holiday` 有外部调用方，响应体 `data` 固定为 boolean。日期校验失败的文案固定为「日期格式错误，应为 YYYY-MM-DD」。
- 日期在库列、接口出入参和远程 JSON 里统一是 `YYYY-MM-DD` 字符串；业务层按 `time.Time` 传递，只在边界上 `Format`/`Parse`。
- `date` 列存 `YYYY-MM-DD` 字符串，年份即前缀，刷新整年靠 `LIKE 'YYYY-%'` 删旧数据。该列有唯一索引 `holiday_days_date_key`，查询因此 `LIMIT 2` 后多行即报错，而不是静默取第一条。
- `RefreshYear` 用事务包住「先删后插」，中途出错即回滚；插入是一条 `INSERT ... SELECT unnest(...)`，空数组自然插 0 行，所以远程为空时（次年安排未发布）不用特判。
- 远程拉取放在事务外，不让最长 60 秒的 HTTP 调用占着数据库连接；每条记录的日期格式校验过才入库。

**账号与鉴权（`auth`）**：登录后签发 **JWT**（`golang-jwt/v5`，HS256，载荷 `{ sub: userId, exp }`），前端存 localStorage、每个请求放进 `Authorization: Bearer`。没有 sessions 表，服务端也不存已签发的令牌，所以**踢不了人，只能等过期**（真要做就加一列 `users.token_epoch` 签进载荷，代价是每次校验都要查库）。**校验时用 `jwt.WithValidMethods` 把算法锁死成 HS256**，不看令牌头里的 `alg`——照令牌自称的算法去验等于让攻击者自己挑锁。也因此**没有 logout 接口**：退出就是前端把令牌丢掉，留一个只回 200 的空接口反而会让人误以为服务端真作废了它。

密码用 `alexedwards/argon2id`，参数显式写成 `m=64MB, t=2, p=1`，单次校验约 40 毫秒。校验时参数是从哈希串里读的，所以改这里只影响新建的密码，已有的哈希照样验得过。**用户名判重交给唯一索引而不是先查再插**：先查再插在两个并发请求之间有窗口，而 `users_username_key` 本来就在那儿，捕获 PostgreSQL 的 `23505` 即可。登录时**用户不存在也要跑一次哈希校验**（拿一个固定的假哈希顶上），否则响应快慢就把「哪些用户名存在」说出去了。

**注册开关 `ALLOW_REGISTRATION` 默认关**，只有显式设成 `"true"` 才开。公网部署时任何人注册即可借这台机器代理 e 站流量，被封的是本机出口 IP；而且 e 站凭据现在是明文入库的，账号越少、越都是自己人，那个取舍才成立。没有留「第一个账号自动放行」之类的后门——建号就是临时开一下开关、注册、关回去重启。

**图片走签名地址而不是令牌**（`signing/signing.go`）：`<img src>` 是浏览器自己发的请求，带不了 `Authorization` 头。所以两个图片接口不鉴权，只认地址里的签名——签名覆盖「这是哪一份附件」加过期时间，两者任一被改就对不上。缩略图签的是上游地址，大图签的是 `userId:gid:token`：**页码刻意不参与签名**，一本图集一张通行证，否则 300 页的详情就得回传 300 条签好的地址；地址模板由 `GET /api/eh/galleries/{gid}/{token}` 随详情下发，形如 `.../pages/{page}/image?uid=&e=&s=`，前端只把 `{page}` 换成页码。**大图的 userId 只能取自签名过的 `uid` 参数**，不能取当前登录者——那条链路根本没有登录者。有效期由 `security.attachmentTtl` 控制（默认 24 小时），过期表现为图片裂开，重新取一次详情即可；签名不对或过期回 **403** 而不是 502——过期是有效期到点后的日常现象，混进 502 会把「e 站真的挂了」的信号淹掉。缩略图地址在**组装响应时**才签名，不进图集元数据缓存，否则缓存 TTL 就得永远短于附件有效期。`internal/app/router_test.go` 专门测这个闭环：地址在「签发」（`eh/service.go` 拼模板）和「校验」（`eh/handler_image.go` 读参数 + 路由模式）两处各拼一次，两边不一致的话所有图片会一起打不开，而各自的单元测试都是绿的。

**e 站模块（`eh`）分层**：`handler.go` / `handler_image.go`（校验 `gid` 正整数、`token` 为 10 位十六进制——这两项会被拼进上游地址）→ `Service`（对外门面：编排用例、元数据缓存、附件地址的签发与校验）→ `Client`（统一出网：伪装 UA、带固定 Cookie、超时、异常翻译）。

`Service` 对外交出的是 `Attachment` 这样的值类型而不是 `*http.Response`——否则关连接、搬响应头这些事就得靠约定分摊到 handler。

`Service` 底下还挂着两块自带状态的协作者，都由 wire `new` 好注入进去：

- **`CredentialStore`（`credentials.go`）**：凭据入库、取出、按有没有里站权限决定这次请求走前站还是里站。它那三个方法在 `Service` 上只是原样转交——handler 只认门面一个依赖，模块内部怎么分工不往外泄。
- **`ImageLocator`（`locator.go`）**：「第 N 页的图片地址是什么」这条链路，连同它那五张缓存表。对外三个方法：`Resolve(ctx, rc, ref, page, reload)` 拿地址（`reload` 用于图床失效后换源，它绕开所有缓存），`GalleryPage` 抓详情页的某一片（评论接口也走它，两边共用在途去重），`AbsorbGalleryPage` 收下 HTML 里顺带带来的每页令牌。

**缓存和去重都用现成的**：进程内缓存一律是 `hashicorp/golang-lru/v2/expirable`（LRU + TTL，自带锁），并发请求合并用 `golang.org/x/sync/singleflight`。**一张缓存表都不建**：图集元数据在 `Service`，每页令牌、分片大小、showkey、换源令牌、解析出的图片地址在 `ImageLocator`，凭据在 `CredentialStore`。这些数据都能重新拉，为可重建的东西加表、加运维负担不值。

`parser.go` 是纯函数层，配 `parser_test.go` 末尾那几个常量单测，内容是从真实页面裁下来的。

几条已在注释里固化的取舍：

- **能走 JSON API 的一律不解析 HTML**。标题、标签、分类、总页数全部来自 `gdata`，只有三样东西非 HTML 不可：列表页的图集序列、详情页的每页令牌与评论、图片页的 showkey。
- **详情页的令牌和评论分成两个解析函数**（`parseGalleryPage` / `parseGalleryComments`）。取图链路每翻一片就要走一次前者，而它不需要评论；正则版比给一页 74 KB 的详情页建 DOM 快两个数量级，而建 DOM 那点时间正花在有几十路图片在转发的时候。评论那一个用 goquery，其余全是正则。
- **正则捕获出来的、要进缓存的短字符串必须 `strings.Clone`**（`parser.go` 里的 `detach`）。Go 的子串与父串共享同一块底层数组，直接把 10 个字符的令牌存进 20~30 分钟 TTL 的缓存，会把整页 HTML 一起钉在内存里。
- **HTML 实体只解码带分号的严格写法**（`decodeEntities`）。直接用 `html.UnescapeString` 不行：它按 HTML5 的历史兼容规则允许 `&not` 这类实体省掉分号，于是标题里的 `&notreal;` 字面量会被解成 `¬real;`。判据是「解出来的结果尾巴上还留着没被吃掉的分号」，`&semi;` 是唯一的例外。
- **列表页用正则全文抓 `/g/<gid>/<token>/`**，不挑 `td.gl3c.glname` 这类选择器：搜索结果有 5 种显示模式且由账号设置决定，Thumbnail 模式下整个 `<table>` 都不存在。请求固定带 `sl=dm_2` 作为双保险。
- **请求固定带 `nw=1`**。被标记的图集在没有这个 cookie 时会返回 HTTP 200 的内容警告插页，正文里既没有 `#gdt` 也没有 `#cdiv`，不设防会静默返回空数据。
- **四种「200 但不是你要的东西」必须识别**（`client.go` 的 `assertUsable`）：内容警告插页、sad panda（里站回 200 + 空 body）、IP 被封（200 的纯文本页）、509 配额超限。判定和翻译收在同一个函数里，由 `web.Handler` 转成状态码。封禁和内容警告按**字面量**匹配文案，不用 `(?i)` 正则——后者在一页 74 KB 的 HTML 上要 2.6 毫秒（实测），而每个上游响应都得走一次判定，字面量是 2 微秒。代价是 e 站改文案时会漏判，但正则也只挡得住「大小写变了」这一种改法。撞上封禁不会自动停手，因为出网没有熔断。
- **出网不限速、不熔断**：请求节奏不受控，出口 IP 有被盯上的风险。要加的话，加在 `eh.Client.do` 外面一层，而不是散到各个调用点。
- **不跟随重定向**（`http.Client.CheckRedirect` 直接返回 `ErrUseLastResponse`）：里站 Cookie 无效时会 302 回前站，跟随的话会拿到一个「看起来正常」的前站页面；图片那条链路上它还多挡一层，白名单主机若被诱导 302 到内网，跟随就等于绕过了白名单。
- **取图链路**：每页令牌 → showkey → `showpage` 接口。**`showpage` 的响应里白送了下一页的令牌**，顺序阅读时顺手写回缓存，所以一本 300 页的图集只需要 2 次 HTML 请求（首页详情 + 首张 `/s/` 页），之后每页只有 1 次轻量 API 调用，只有跳页才会回头抓详情页分片。showkey 失效（`{"error":"Key mismatch"}`）时重抓 `/s/` 页换新的，**只重试一次**。图床节点失效表现为图片 403，用页面里的 `nl` 令牌换源重取一次。
- **签名在地址上的形状（参数名 `e` / `s`）由 `signing.Signature` 的 `Query` / `ParseQuery` 定死**，签发端和校验端不各写一份字面量——改名时漏一处的表现是所有图片一起 403。
- **缩略图代理用 HMAC 签名地址**，端点只认自己签发过的 URL，客户端指定不了主机。白名单（精确匹配 `ehgt.org`、后缀 `.hath.network`，注意那个点不能省）、不跟随重定向、`Content-Type` 必须 `image/` 是纵深防御，别放宽。
- **`f_cats` 传的是要排除的分类位和**，方向极易写反；全不选和全选都要省略这个参数（按公式算全不选会得到 1023，那是「全部排除」）。换算封在 `category.go` 的 `toCategoryFilter` 里，接口和前端只用分类名。分类名的唯一来源是同文件的 `categoryBits`，handler 拿它做校验——不校验的话前端拼错名字只会让那一位算成 0，表现是「筛选点了但结果没变」，查不出来。
- **e 站的 JSON 接口对数字的写法不统一**：`gid` 是数字，`filecount`、`rating` 这些是字符串（`"329"`、`"4.68"`）。两种都用 `flexNumber` 收（`models.go`），写死成数字类型会在字符串那一侧整片报错。
- **e 站 Cookie 明文入库**（`eh_credentials.cookie`，JSON 文本）：注册不开放，库里只有自己人的凭据，为此再上一层加解密不划算。代价要认清——**那一列等同于 e 站账号本身**，拿到就能登进去，所以数据库备份、从库、监控查询都要按凭据的标准对待。读的时候**不做「解析不出来就当未绑定」的兜底**：那一列只由 `Bind` 写入，真解析不出来说明有人手工改过库，让错误抛出去比静默显示成「未绑定」好查得多。
- 主密钥按用途派生子密钥（`signing.DeriveSecret`）：JWT 签名（`jwt-v1`）和图片地址签名（`attachment-v1`）各用各的，不共用裸密钥。两处派生都写在 `cmd/myapi/providers.go` 里，摆在一起才看得出有没有谁直接拿了裸主密钥。改用途标签等于换密钥，已签发的令牌和已发出去的图片地址会一起失效。

**启动顺序**（`cmd/myapi/main.go`）：wire 组装（读配置 → 建日志器 → 建连接池 → 各层构造器）→ 并行拉取当年和次年的节假日数据 → 监听端口。前两步任一失败即退出进程，不带着不完整的状态对外服务。连接池是惰性建连的，库连不通会在那次节假日刷新时暴露出来，所以本地跑后端需要能连上 PostgreSQL 且能访问 `raw.githubusercontent.com`。启动后按 `holiday.refreshInterval`（默认 24 小时）重复同一刷新，年份每次重新计算所以跨年不用重启；定时刷新失败只记日志不退出，库里已有数据可继续服务。收到 `SIGINT` / `SIGTERM` 时给在途请求 10 秒收尾，正在传的图片不至于半途断掉。

**配置用 viper，三层来源后面盖前面**：结构体默认值 → 可选的 `config.yml` → 环境变量。容器部署可以完全不放配置文件、全用环境变量；本地开发反过来，写进 `config.yml` 省得往 shell 里塞一堆 `export`。文件先找工作目录、再找可执行文件旁边（镜像里可以挂到 `/app/config.yml`），**没有这个文件是正常情况**，不报错。

配置项清单是 `internal/config/config.go` 里的 `settings()`——一行写全「viper 的 key、环境变量名、默认值」三件事，加一项就是加一行，不会出现「加了默认值忘了绑环境变量」这种漏。几处约定：

- **环境变量名是扁平的大写**：`SECRET_KEY` / `DATABASE_URL` / `PORT` / `STATIC_DIR` / `ALLOW_REGISTRATION` / `TOKEN_TTL` / `ATTACHMENT_TTL` / `HOLIDAY_REFRESH_INTERVAL` / `LOG_LEVEL` / `LOG_FORMAT` / `EH_USER_AGENT` / `EH_REQUEST_TIMEOUT` / `DATABASE_MAX_CONNS` / `DATABASE_MAX_CONN_LIFETIME`。
- **逐条 `BindEnv`，不用 `AutomaticEnv`**：后者对 `Unmarshal` **根本不生效**，而且它按 key 反推变量名（`security.secretKey` → `SECURITY_SECRETKEY`），跟上面那些名字对不上。
- **时长写成带单位的字符串**（`tokenTtl: "720h"`、`TOKEN_TTL=30s`），字段类型是 `time.Duration`，解析交给 viper 默认的 `StringToTimeDurationHookFunc`。`settings()` 里的默认值直接写 Go 常量（`30 * 24 * time.Hour`），比字符串好读。**不要设自定义 `DecodeHook`**——那会顶掉这个默认钩子，以后所有 `Duration` 字段就都不认字符串了。

  单位只有 `ns` / `us` / `ms` / `s` / `m` / `h`，**没有天**，30 天要写 `720h`；大小写敏感。

- **在 yml 里写裸数字的时长会被静默当成纳秒**（`tokenTtl: 720` → 720 纳秒，表现是登录立刻掉线）。原因是 YAML 把它解成整数，绕过了只认字符串的钩子，被 mapstructure 直接 `SetInt`。代码里不为这种写错兜底，写配置的时候自己带上单位。环境变量那条路不用管，裸数字在解码时就报错了。
- **在 `config.yml` 里写出来的项就会生效，包括空值**。不想覆盖默认值的项要注释掉，别留空串——`config.example.yml` 就是照这个规矩写的。

改配置项时 `config.example.yml` 要跟着改，那是给人看的唯一一份清单。

`http.Server` 刻意**不设 `WriteTimeout`**：从慢的 H@H 节点流式转发一张大图可能要几十秒，设了就会传到一半被掐断；慢速攻击由 `ReadHeaderTimeout` 挡。

**数据库：不引迁移工具，进程也不碰 DDL**。`internal/store/schema.sql` 是表结构的唯一真相，sqlc 靠它推导查询的出入参类型；建表、改列、加索引都由人工上库执行。语句写成 `CREATE TABLE IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS` 的幂等形式，重跑一遍不会报错。

`internal/store/query.sql` 是全部查询，同目录的 `db.go` / `models.go` / `query.sql.go` 由 `sqlc generate` 生成，**要入库、不要手改**。改完 SQL 记得重新生成。

**建表约定（每张表都要遵守）**：

- **`id`、`created_at`、`updated_at` 三列一张不少**。`id` 用 SQL 标准的 identity（`GENERATED BY DEFAULT AS IDENTITY`），不用旧式的 `serial`。
- **时间由查询显式写 `now()`**，表上这两列既没有 `default` 也没有触发器 —— 新写一条 `INSERT` 时漏掉它们会直接报 NOT NULL 违例，而不是悄悄落一个别处填的时间。
- **业务上的唯一性用 unique 索引表达，不占主键位置**：主键统一是 `id`。`eh_credentials.user_id`、`eh_reading_progress.(user_id, gid)` 都是唯一索引，同时也是各自 upsert 的冲突目标。
- **用户名大小写敏感**：`Alice` 和 `alice` 是两个账号，登录要求完全一致。`users_username_key` 因此是建在 `username` 上的普通唯一索引，查询用 `=` 即可。（真要改成大小写不敏感，索引和查询必须用同一个表达式，否则查询走不到索引、退化成全表扫。）

**测试**：`go test`，测试文件与源码同目录（`*_test.go`），用例名直接写中文（`t.Run("换一个 subject 就通不过", ...)`）。只留四类值得单独测的东西，别再往回加那些只是在复述框架行为的用例：

- `eh/parser_test.go`——最容易被 e 站改版打破的一层。样本是文件末尾那几个 HTML 常量，从真实页面裁下来，留的是解析器要认的结构加上会干扰它的噪声（同一行里其它形式的 gid/token 链接、分页导航里 `unext` 之外的 id），纯展示用的属性删掉了。重新采样时保持同样的裁剪方式：结构特征要真实，体积要小。
- `eh/client_test.go` 的 `IsAllowedImageURL`——图片代理唯一的 SSRF 防线，列的都是真会被人试的绕过手法。
- `signing/signing_test.go`——签名地址是图片接口唯一的鉴权手段，每个用例对应一种「本不该放行却放行了」的后果。
- `config/config_test.go`——三层来源的优先级，写错了表现是「配置改了但没生效」，很难当场看出来。
- `app/router_test.go`——签名地址的闭环（详情签发的地址，图片接口必须认得出来；改 `uid` 冒充别人必须失败），顺带锁住「未登录回 401」「未匹配的 `/api` 路径回 JSON 404」「其余路径回空响应体的 404」这三条全局契约。它用真实的服务组装一次应用，只把数据库（假 `DBTX`，一律返回「没有这一行」）和出网（假 `http.RoundTripper`）换成假的，所以请求仍然走完整的拼地址、带 Cookie、判响应这条链路。

## 前端架构

**组件一律用 TSX 写**（`defineComponent` + `setup` 返回渲染函数），不写 `.vue` 单文件组件 —— `src/components/ui/` 下的 `.vue` 是 shadcn-vue 生成的产物，属于可直接修改的项目源码，但新增业务组件请沿用 TSX。JSX 支持来自 `@vitejs/plugin-vue-jsx`。

目录职责：`views/`（页面）、`layouts/`（应用外壳与侧边栏）、`api/`（接口封装）、`stores/`（Pinia）、`components/ui/`（shadcn-vue 组件）。`@` 别名指向 `src`。

**路由与导航的单一来源**：路由表 `router/index.ts` 的 `meta.title` 是页面名称的唯一定义处，顶栏标题与侧边栏文案都从这里取；`layouts/navigation.ts` 只声明「哪些路由进侧边栏、用什么图标」。新增页面 = 加一条路由记录（含 `meta.title`），需要进侧边栏再往 `navigationItems` 追加一项。使用哈希路由（`createWebHashHistory`）。

`meta.requiresAuth` 决定 `beforeEach` 拦不拦；首页和节假日页保持公开。登录页和阅读视图是**顶层路由**（与 `/` 布局平级），因为它们要全屏、不套 `AppLayout`。

**列表状态放 store 而不是 KeepAlive**：`stores/GalleryListStore.ts` 存已加载的条目和游标。不用 KeepAlive 是因为阅读视图是顶层路由，进去时整个 `AppLayout` 连同里面的 KeepAlive 一起卸载，缓存就没了；放 store 则无论从哪条路径回来都还在，配合路由的 `scrollBehavior`（`savedPosition`）就能接着往下翻。

**HTTP 层**：`api/httpClient.ts` 的 axios 响应拦截器已把 `response.data` 解包，并把错误统一转成携带后端 `msg` 的 `Error`。业务侧只写 `api/xxx.ts` 里的具名函数，不要直接用 axios。401 的跳转处理由 `main.ts` 用 `onUnauthorized()` 注入，**不要在 httpClient 里直接 import router**——router 会加载各个页面、页面又 import httpClient，直接依赖就成环了。

**登录令牌存 localStorage**（`api/httpClient.ts`）：请求拦截器统一加 `Authorization: Bearer`，401 时顺手清掉本地令牌再交给 `onUnauthorized()` 跳转。退出登录没有后端往返，就是 `setToken("")`。

**图片地址不要自己拼**：缩略图地址由后端签好放在 `thumbnail` 字段里；大图要先从 `fetchGalleryDetail` 拿 `imageUrlTemplate`，再交给 `galleryImageUrl(template, page)` 把 `{page}` 换掉——这两条地址的身份都签在里面，前端改动其中任何一部分都会让签名失效。预取和正式显示必须拼出完全一样的地址，否则命不中同一份浏览器缓存。

**shadcn-vue 组件不声明原生属性**：`disabled`、`type`、`placeholder`、`autocomplete` 这些要走展开语法 `{...{ disabled: x }}` 才能透传给根元素，直接写成 JSX 属性过不了类型检查。

**主题**：暗色用 `html.dark` class 策略（`styles/index.css` 里的 `@custom-variant dark` 覆盖了 Tailwind 4 默认的媒体查询策略），由 `AppStore` 统一切换，并同步 `meta[name=theme-color]`。主题初始化在 `main.ts` 挂载前执行，避免首帧闪白。

**Tailwind 4**：无 `tailwind.config`，主题变量全部写在 `styles/index.css` 的 `@theme` / `@theme inline` 中。`.vscode/settings.json` 已把 `.css` 关联到 tailwindcss 语言模式并声明 `cn`/`cva` 为类名函数。

## 语言约定

代码注释、提交信息与文档一律用简体中文。注释写「为什么这么做」而非复述代码，现有代码里的取舍说明（事务边界、日期表示方式、CSS 覆盖原因等）是主要的上下文来源，改动相关代码时同步更新。

**标识符按各自语言的惯例**：Go 用驼峰、导出的首字母大写，前端 TypeScript 用 camelCase。Go 测试里 `t.Run()` 的名称是普通字符串而非标识符，直接写中文描述（`go test -run` 按它过滤，中文要用正则转义或加引号）。

## Agent skills

### Issue tracker

问题与规格以 Markdown 文件形式存放在 `.scratch/` 下。详见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用五个标准角色的默认标签字符串。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

