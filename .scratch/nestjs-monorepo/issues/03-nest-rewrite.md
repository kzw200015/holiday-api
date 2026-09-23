# 03: 用 NestJS 重写后端并切换，删除 Kotlin 版

**What to build:** `apps/server` 用 NestJS 12 实现全部接口，沿用现有库和数据；前端改接新的响应结构；镜像改为构建 Nest 版；删除 Kotlin 后端。读者重写后不用重新登录、已绑定的 e 站账号照常可用、旧图片地址继续命中缓存。规格见 `../spec.md`，实现决策、接口契约变更、测试接缝都以规格为准。

**这是重写，不是移植**（见规格「重写原则」）。读 Kotlin 版是为了弄清对外行为、e 站协议事实和当初踩过的坑，不照着它的文件、类、辅助抽象、正则、缓存清单或测试结构去翻译。必须保持一致的只有持久化兼容（库表、旧哈希、旧令牌、旧签名地址）和读者可见的行为（接口字段、文案、业务规则），其余按 Nest 和 Node 的惯用写法设计。

体量大，按下列顺序推进，每一段在 HTTP 边界上有测试兜底后再进下一段；中途换上下文时，从第一个未勾选的段落接着做。前端切换之前，前端仍连 Kotlin 版，不会断。

**Blocked by:** 02（共享包，前端改为从共享包取类型）

**Status:** resolved

### 骨架、数据库与节假日

- [x] 用 `nest new --type esm` 生成骨架（Express 适配器、Vitest），去掉脚手架自带的格式配置，接入全仓 Prettier 与 oxlint
- [x] `@nestjs/config` 读环境变量并用 zod 校验：`DATABASE_URL`、`SECRET_KEY`（至少 32 字节，否则拒绝启动）、`ALLOW_REGISTRATION`、`TOKEN_TTL`、`EH_USER_AGENT`、`EH_REQUEST_TIMEOUT`、`ATTACHMENT_TTL`、`PORT`（默认 8000），默认值与现行一致；提交 `.env.example`
- [x] Drizzle + `pg`：以 `drizzle-kit pull` 的结果为底稿整理 schema，基线迁移写成幂等形式（已有的库只登记不改动）；第二条迁移给时间列补 `defaultNow()`，更新时间由 `$onUpdate` 维护；启动时用迁移器自动执行
- [x] 测试架子：Testcontainers PostgreSQL（先建出与线上一致的旧表结构并登记基线，再由应用启动跑后续迁移）+ 可注入的出网 provider 替身（回放内存响应、记录请求）+ supertest
- [x] 全局启用 `StandardSchemaValidationPipe`，控制器参数挂共享 schema；数字路径参数同样用 schema 校验（内置整数解析管道放行负数与超大数、文案是英文，改掉了）
- [x] 节假日：启动时刷新当年与次年（失败时库里有当年数据则继续，否则拒绝启动）、`@Cron` 每日刷新、远程为空不动库、同一事务先删后插；`is-holiday` 返回布尔值、`detail` 返回 `{date,isOffDay,name}`、缺省日期取北京时间今天、严格日期校验
- [x] `@nestjs/serve-static` 提供前端产物，未匹配路径回 Nest 默认 JSON 404

### 签名与鉴权

- [x] 主密钥派生子密钥：SHA-256(主密钥原文 + 冒号 + 用途标签)，令牌与附件两种用途标签与现行逐字一致
- [x] 注册、登录、`me`、`options`：用户名规则与大小写敏感、关闭注册提示、「用户名或密码错误」不区分原因、用户名冲突提示；`argon2` 参数对齐（argon2id、m=65536、t=2、p=1、16 字节盐、32 字节哈希），保留假哈希计时，去掉并发上限与 429
- [x] 全局 Guard + `@nestjs/jwt`（HS256、`sub` + `exp`），`@Public()`、`@CurrentUser()`（可空即允许未登录）
- [x] 测试：旧 argon2id 哈希验得过；Kotlin 版签发的令牌认得回；伪造、`alg: none`、换密钥、过期不认；公开接口清单锁定

### e 站凭据、偏好与搜索历史

- [x] 绑定 e 站账号：查询、绑定（并发探测表站与里站，无效不入库）、解绑；Cookie 手工拼接；凭据每次从库里读、不缓存，换绑解绑当场生效
- [x] 偏好、搜索历史：读取与整份保存，各自 upsert 互不覆盖，没有记录时回默认值

### 图集搜索、详情、评论

- [x] 搜索：选站规则（有里站权限默认里站、可降到表站、未绑定匿名表站）、分类排除掩码、表单编码、列表解析、gdata 元数据批量补齐（`lru-cache` 的 `fetch()` 合并并发加载、失败不缓存；缓存什么、容量和过期时间按新实现决定）、签名缩略图地址、游标翻页
- [x] 识别上游失败（图片配额、临时封禁、里站不放行、内容警告、e 站凭据被拒、图集不存在、e 站提示原文、网络不通），中文文案不变，识别方式自己设计
- [x] 详情：卡片字段平铺，带阅读进度与大图地址模板；元数据与进度并发读取
- [x] 评论：正文折叠空白、去掉首尾空白，拆成 text / break / link 片段，只放行 http/https
- [x] 解析手段自选，不照搬 Kotlin 的正则；e 站 HTML 样本原样搬入测试目录，不格式化，解析结果经接口断言

### 图片

- [x] 真实出网 provider：`fetch` + undici `Agent`，`headersTimeout`、`bodyTimeout`（空闲超时），`redirect: "manual"`，统一 User-Agent，取图不带 Cookie
- [x] SSRF 白名单（仅 https、无 userinfo、`ehgt.org` 或 `*.hath.network`），按 WHATWG URL 语义判定；参考 Kotlin 用例里的攻击手法，期望结果按这条语义重新判断
- [x] 缩略图与大图接口：`StreamableFile` 流式转发，响应头与现行一致；头未发出时清缓存头回 502，已发出时销毁连接；拒收非图片与 SVG
- [x] 大图定位：分片与页令牌推算、页码越界 404、showpage 失败退回抓图片页、按凭据隔离、节点失败用本页 nl 换源重试一次、509 提示图识别为图片配额用尽
- [x] 旧缩略图地址与旧大图地址验得过，改 uid 或过期时间回 403，同一窗口签出的地址相同
- [x] 次接缝测试：真实出网 provider 对本机 HTTP 服务，验证不跟随重定向、空闲超时语义、半截响应断连

### 阅读进度与阅读历史

- [x] 进度上报：同一上报方只接受更大的序号，不同上报方按到达顺序覆盖
- [x] 阅读历史：`(updated_at, gid)` 游标分页，游标里的时间按字符串原样传给数据库（同一时刻多行不漏不重）；元数据取不到时 `gallery` 为 null；删除一条、清空全部，同时删除对应阅读进度

### 切换

- [x] 前端 `httpClient` 不再解包 `{code,data,msg}`，报错读 `message`（兼容字符串与字符串数组），401 处理照旧；相关前端测试同步调整
- [x] 开发代理仍指向 8000，根目录 dev 同时启动共享包 watch、server、web
- [x] Dockerfile 三阶段：构建 shared、web、server → `pnpm --filter` 对 server 做 `deploy --prod` → `node:24-alpine` 运行时，带前端产物与迁移文件，非 root，端口 8000
- [x] 把本地 Kotlin 配置里的主密钥与数据库连接迁入 `apps/server/.env`（过程中不打印这些值），然后删除 `backend/`，更新 `.gitignore`、`.dockerignore`
- [x] 交付说明附新旧环境变量名对照表，并提醒休息日查询接口的外部调用方改为读布尔值
- [x] 一次性核对：基线迁移与真实库逐表等价；用真实主密钥核对一条现网令牌与一条现网图片地址在新后端验得过
- [ ] 本地起整站，手工走一遍（界面走查留给用户；已用开发库账号对真实 e 站做过接口级冒烟：搜索、详情、评论、大图、缩略图、阅读历史、偏好、节假日均正常）：登录、绑定 e 站账号、搜索、详情、评论、阅读器翻页与自动翻页、阅读历史、偏好、节假日查询
- [x] 根目录 `pnpm build`、`pnpm test`、`pnpm lint`、`pnpm format:check` 全部通过，镜像能构建并启动
- [x] 一个 `refactor:` 提交（契约变化要求前后端同一提交）

## 交付说明

### 环境变量对照

| Kotlin 版 | Nest 版 | 说明 |
| --- | --- | --- |
| `MYAPI_SECRETKEY` | `SECRET_KEY` | 必须沿用原值，旧令牌与旧图片地址才继续有效 |
| `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` | `DATABASE_URL` | 合成一条 `postgres://用户:口令@主机:端口/库名`，用户名口令里的特殊字符要百分号编码；账号要有建表、改表的权限 |
| `MYAPI_AUTH_ALLOWREGISTRATION` | `ALLOW_REGISTRATION` | 默认 false |
| `MYAPI_AUTH_TOKENTTL` | `TOKEN_TTL` | 默认 30d |
| `MYAPI_EH_ATTACHMENTTTL` | `ATTACHMENT_TTL` | 默认 24h |
| `MYAPI_EH_REQUESTTIMEOUT` | `EH_REQUEST_TIMEOUT` | 默认 30s |
| `MYAPI_EH_USERAGENT` | `EH_USER_AGENT` | |
| `SERVER_PORT` | `PORT` | 默认 8000 |
| `MYAPI_HOLIDAY_REFRESHINTERVAL` | （删除） | 改为每天北京时间 04:30 刷新一次 |
| `LOGGING_LEVEL_ROOT` | （删除） | 用 Nest 自带的 Logger |

时长只认「整数 + 单位」（ms / s / m / h / d），Spring 那边接受的裸毫秒数与 `PT1H30M` 写法不再支持。

### 需要外部配合

- 休息日查询接口 `GET /api/holiday/is-holiday` 的响应体改成直接的 JSON 布尔值（原先是 `{"code":200,"data":false,"msg":"OK"}`），外部调用方改为读布尔值；失败时是 `{statusCode, message, error}`。
- 部署环境的环境变量按上表改名。
- 应用第一次启动会在库上执行迁移：给时间列加默认值，并把早期工具留下的约束名统一成标准名（只改名，不动定义）。

### 一次性核对（已完成）

- 开发库与旧建表脚本逐项比对：列、索引一致；有 3 个约束名不同（语义相同），由迁移 0002 统一。迁移后约束逐项一致，列只多出时间列的 `now()` 默认值。线上库如果不是这个开发库，上线前要再对线上库比对一次。
- 用真实主密钥由 Kotlin 版签发的令牌与图片地址在新后端验得过：「我是谁」认出原账号，同一时刻签出的大图地址逐字一致，真实大图与缩略图取得到，改 uid 回 403。

