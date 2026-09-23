# 03: 用 NestJS 重写后端并切换，删除 Kotlin 版

**What to build:** `apps/server` 用 NestJS 12 实现全部接口，沿用现有库和数据；前端改接新的响应结构；镜像改为构建 Nest 版；删除 Kotlin 后端。读者重写后不用重新登录、已绑定的 e 站账号照常可用、旧图片地址继续命中缓存。规格见 `../spec.md`，实现决策、接口契约变更、测试接缝都以规格为准。

体量大，按下列顺序推进，每一段在 HTTP 边界上有测试兜底后再进下一段；中途换上下文时，从第一个未勾选的段落接着做。前端切换之前，前端仍连 Kotlin 版，不会断。

**Blocked by:** 02（共享包，前端改为从共享包取类型）

**Status:** ready-for-agent

### 骨架、数据库与节假日

- [ ] 用 `nest new --type esm` 生成骨架（Express 适配器、Vitest），去掉脚手架自带的格式配置，接入全仓 Prettier 与 oxlint
- [ ] `@nestjs/config` 读环境变量并用 zod 校验：`DATABASE_URL`、`SECRET_KEY`（至少 32 字节，否则拒绝启动）、`ALLOW_REGISTRATION`、`TOKEN_TTL`、`EH_USER_AGENT`、`EH_REQUEST_TIMEOUT`、`ATTACHMENT_TTL`、`PORT`（默认 8000），默认值与现行一致；提交 `.env.example`
- [ ] Drizzle + `pg`：从现有表结构 `drizzle-kit pull` 出 schema 与基线迁移；第二条迁移给时间列补 `defaultNow()`，更新时间由 `$onUpdate` 维护；启动时用迁移器自动执行
- [ ] 测试架子：Testcontainers PostgreSQL（先建出与线上一致的旧表结构并登记基线，再由应用启动跑后续迁移）+ 可注入的出网 provider 替身（回放内存响应、记录请求）+ supertest
- [ ] 全局启用 `StandardSchemaValidationPipe`，控制器参数挂共享 schema；数字路径参数用内置整数解析管道
- [ ] 节假日：启动时刷新当年与次年（失败时库里有当年数据则继续，否则拒绝启动）、`@Cron` 每日刷新、远程为空不动库、同一事务先删后插；`is-holiday` 返回布尔值、`detail` 返回 `{date,isOffDay,name}`、缺省日期取北京时间今天、严格日期校验
- [ ] `@nestjs/serve-static` 提供前端产物，未匹配路径回 Nest 默认 JSON 404

### 签名与鉴权

- [ ] 主密钥派生子密钥：SHA-256(主密钥原文 + 冒号 + 用途标签)，令牌与附件两种用途标签与现行逐字一致
- [ ] 注册、登录、`me`、`options`：用户名规则与大小写敏感、关闭注册提示、「用户名或密码错误」不区分原因、用户名冲突提示；`argon2` 参数对齐（argon2id、m=65536、t=2、p=1、16 字节盐、32 字节哈希），保留假哈希计时，去掉并发上限与 429
- [ ] 全局 Guard + `@nestjs/jwt`（HS256、`sub` + `exp`），`@Public()`、`@CurrentUser()`（可空即允许未登录）
- [ ] 测试：旧 argon2id 哈希验得过；Kotlin 版签发的令牌认得回；伪造、`alg: none`、换密钥、过期不认；公开接口清单锁定

### e 站凭据、偏好与搜索历史

- [ ] 绑定 e 站账号：查询、绑定（并发探测表站与里站，无效不入库）、解绑；Cookie 手工拼接；e 站凭据缓存在绑定、解绑时作废且等在途回填完成
- [ ] 偏好、搜索历史：读取与整份保存，各自 upsert 互不覆盖，没有记录时回默认值

### 图集搜索、详情、评论

- [ ] 搜索：选站规则（有里站权限默认里站、可降到表站、未绑定匿名表站）、分类排除掩码、表单编码、列表解析、gdata 元数据批量补齐（`lru-cache` 的 `fetch()` 合并并发加载、失败不缓存）、签名缩略图地址、游标翻页
- [ ] 上游失败识别与中文文案按规格逐条移植（图片配额、临时封禁、里站不放行、内容警告、e 站凭据被拒、图集不存在、e 站提示原文、网络不通）
- [ ] 详情：卡片字段平铺，带阅读进度与大图地址模板；元数据与进度并发读取
- [ ] 评论：`cheerio` 解析，对齐 jsoup 的空白处理，正文拆成 text / break / link 片段，只放行 http/https；HTML 实体只认带分号的合法命名实体
- [ ] e 站 HTML 样本原样搬入测试目录，不格式化；解析行为经接口断言

### 图片

- [ ] 真实出网 provider：`fetch` + undici `Agent`，`headersTimeout`、`bodyTimeout`（空闲超时），`redirect: "manual"`，统一 User-Agent，取图不带 Cookie
- [ ] SSRF 白名单（仅 https、无 userinfo、`ehgt.org` 或 `*.hath.network`），现有用例全部移植并以旧行为为准
- [ ] 缩略图与大图接口：`StreamableFile` 流式转发，响应头与现行一致；头未发出时清缓存头回 502，已发出时销毁连接；拒收非图片与 SVG
- [ ] 大图定位：分片与页令牌推算、页码越界 404、showpage 失败退回抓图片页、按凭据隔离、节点失败用本页 nl 换源重试一次、509 提示图识别为图片配额用尽
- [ ] 旧缩略图地址与旧大图地址验得过，改 uid 或过期时间回 403，同一窗口签出的地址相同
- [ ] 次接缝测试：真实出网 provider 对本机 HTTP 服务，验证不跟随重定向、空闲超时语义、半截响应断连

### 阅读进度与阅读历史

- [ ] 进度上报：同一上报方只接受更大的序号，不同上报方按到达顺序覆盖
- [ ] 阅读历史：`(updated_at, gid)` 游标分页，游标里的时间按字符串原样传给数据库（同一时刻多行不漏不重）；元数据取不到时 `gallery` 为 null；删除一条、清空全部，同时删除对应阅读进度

### 切换

- [ ] 前端 `httpClient` 不再解包 `{code,data,msg}`，报错读 `message`（兼容字符串与字符串数组），401 处理照旧；相关前端测试同步调整
- [ ] 开发代理仍指向 8000，根目录 dev 同时启动共享包 watch、server、web
- [ ] Dockerfile 三阶段：构建 shared、web、server → `pnpm --filter` 对 server 做 `deploy --prod` → `node:24-alpine` 运行时，带前端产物与迁移文件，非 root，端口 8000
- [ ] 把本地 Kotlin 配置里的主密钥与数据库连接迁入 `apps/server/.env`（过程中不打印这些值），然后删除 `backend/`，更新 `.gitignore`、`.dockerignore`
- [ ] 交付说明附新旧环境变量名对照表，并提醒休息日查询接口的外部调用方改为读布尔值
- [ ] 一次性核对：基线迁移与真实库逐表等价；用真实主密钥核对一条现网令牌与一条现网图片地址在新后端验得过
- [ ] 本地起整站，手工走一遍：登录、绑定 e 站账号、搜索、详情、评论、阅读器翻页与自动翻页、阅读历史、偏好、节假日查询
- [ ] 根目录 `pnpm build`、`pnpm test`、`pnpm lint`、`pnpm format:check` 全部通过，镜像能构建并启动
- [ ] 一个 `refactor:` 提交（契约变化要求前后端同一提交）
