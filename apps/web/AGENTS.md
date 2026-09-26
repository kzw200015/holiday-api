# apps/web

前端：Vue 3 + Vite。全仓通用的约定见根目录 `AGENTS.md`，图集浏览的数据细节另见 `src/features/eh/AGENTS.md`。

## 结构

`src/` 分三块：`app/` 是应用装配（路由、全局布局、导航目录）；`features/` 下每块业务自成一体（`auth`、`eh`、`holiday`，与后端领域模块对应）；`shared/` 放与业务无关的通用能力（HTTP 客户端、读取与写入排队的工具、通用组件与组合式函数、`lib/` 下的格式化与错误处理小工具）。`src/components/ui/` 与 `src/lib/utils.ts` 是 shadcn-vue 生成的源码，保持原样：已排除在 Prettier 与 oxlint 之外，清理代码或用 IDE 格式化时也别碰。静态资源在 `public/`，测试在 `tests/`。

feature 内按角色分文件：`api.ts` 只管 HTTP 调用，经 `shared/api/httpClient.ts` 的 `api`（Eden 客户端）调后端，路径、入参与响应的类型都从后端的 `App` 推断（见 ADR-0007），不手写；`labels.ts` 一类放展示用的中文词汇，`queries.ts` 放这个 feature 的缓存 key 与写入通道，`composables/` 把数据和交互包成页面能直接用的形状，`components/` 与 `views/` 是界面。依赖只有一个方向：`views` → `composables` → `api`/`queries` → `shared/`，页面不直接调接口，`shared/` 不反向引用 `features/` 或 `app/`（`@myapi/shared` 是独立的包，哪一层都可以引用）。多个 feature 拼到一个界面上只在 `app/` 层发生（如设置页同时用 `auth` 与 `eh`）；feature 之间唯一允许的引用是依赖 `auth` 的会话状态，因为换账号要让各自的缓存与在途请求作废。

## 对后端的依赖

前端对后端只有类型依赖：`import type { App } from "@server/app"`，组件 props、测试数据要用具名的响应类型时，直接 `import type` 后端定义它的那个文件（如 `@server/eh/gallery-catalog` 的 `GalleryCard`）。`@server/*` 别名只在 tsconfig 的 `paths` 里，不进 `package.json`；`elysia` 是开发依赖，版本与后端一致。按值引用后端会把后端代码连同 drizzle 打进前端，lint 挡住了（只允许 `import type`，也不许写成 `import { type X }`：开着 `verbatimModuleSyntax`，它编译后会留下一句副作用导入）。两端都要执行的规则放 `@myapi/shared`。

来自后端接口的数据，类型一路从后端推导：调接口时由 Eden 推断；要具名的，`import type` 后端定义它的那个文件（如读回来的偏好是 `@server/eh/preferences.service` 的 `GalleryPreferences`），从它再派生（如 `GalleryFilters`）；要提交给后端的，取那次调用的参数类型（见下）。`@myapi/shared` 只用来执行两端共用的规则（列出分类与评分的选项、提交前预校验、按同一条规则当场改本地数据），不拿它给后端来的数据标类型。

Eden 按后端 schema 的输出类型推断请求要传什么：带默认值的字段也要给全（如搜索条件、e 站 Cookie）。`api.ts` 里带请求体的函数，参数类型取自那次调用，写 `Parameters<typeof api.eh.credential.post>[0]`，不另从 schema 推一份；组合式函数再要这个类型就取 `api.ts` 的函数（`Parameters<typeof bindCredential>[0]`）。

## 组件与界面

组件文件名用 PascalCase，组合式函数用 `useX`。业务组件用 `<script setup lang="ts">`，组件名从文件名推导，KeepAlive 按它匹配，需要别的名字时用 `defineOptions`；props、emits 与双向绑定用类型化的 `defineProps`、`defineEmits`、`defineModel`，不用渲染函数模拟模板。使用 `@/` 路径别名（只在 tsconfig 的 `paths` 里定义，Vite 经 `resolve.tsconfigPaths` 解析），SFC 导入显式带 `.vue`。模板注释用 `<!-- -->`。

shadcn 组件先用它自带的 variant、size 和子组件（按钮拼一组用 `ButtonGroup`，多选开关用 `ToggleGroup`），传进去的 class 只补布局（宽度、flex、换行截断），不为观感改颜色、圆角、内边距，也不加 `cursor-pointer`；默认样式不合适时先找有没有对应的组件，确实非改不可的（如黑底阅读器上的按钮）就地注释原因。

危险操作的按钮用 `variant="destructive"`，不另加样式；代价大、不可撤销的（清空、解绑）先经 `shared/components/ConfirmDialog` 确认。「回上一级」按钮在顶栏，由路由的 `meta.back` 声明，页面里不另放一份；浏览器历史的上一条正好是目标页时退回去，否则原地替换（`shared/composables/useGoBack`），历史里不留重复的一条。

## 数据层

服务端数据统一交给 Pinia Colada（见 ADR-0006），读写只写在 feature 的 `composables/` 里，页面拿到的是包好的 `loading`、`errorMessage` 与数据。数据按 query key 缓存在查询库里，不活在组件里，也不另设 store；key 集中写在 feature 的 `queries.ts`。全局配置在 `shared/api/queries.ts`：数据一律当场就算过期，挂载、换参数都重读一次，在读时复用那次请求；不自动重试，也不在窗口聚焦或网络重连时重读，失败交给用户点重试。列表一律触底加载、用 `useInfiniteQuery`，不做上一页下一页。查询函数用的参数要是这条缓存自己的（`useQuery(() => ({ key, query }))` 在同一个闭包里取值），不能读查询发出那一刻的外部状态。调接口一律套上 `request(api.…)`（有时限的写入用 `requestWithin`），它把失败一律变成带中文说明的 `Error`、令牌失效时退出登录、取消原样抛出；`catch` 到的值经 `shared/lib/errors.ts` 的 `toError` 统一后再取文案。

KeepAlive 只为保留界面状态（输入草稿、滚动位置、已翻的页）而缓存页面。查询库不管 KeepAlive：被留着的页面回来时不会重新挂载，要「每次回来都重读」的在 `shared/composables/useRefreshOnActivated` 里交上组合式函数的 `reload`。各组合式函数只暴露这一个重读入口，底层是查询的 `refresh()`：数据当场就算过期，所以它总会重读，只是在读时复用那次请求，首次挂载触发它也不会多读，重试按钮、刷新按钮用的也是它。

写入与到达顺序无关（偏好按字段 `PATCH`，搜索历史一次记或删一个词）。本地当场改、随后提交的数据一律经 `shared/api/optimistic.ts` 的 `useOptimisticData`，不在各处重写一遍：读之前先等已经发出的写入落地（`settled()`），否则读回来的会把刚改的按回去；改动时先取消在途的读取、再当场改本地，经 `shared/api/writes.ts` 的 `serial` 依次发出（同一字段先后两次改动、先记后删同一个词，乱序都会得到错的结果），存不上、或改的时候还没读到，就重读一次、以服务端为准。一个 feature 只开一路写入，读它的数据之前不分是哪一类，都等全部写入落地；不必排队的写入（进度上报、删除阅读历史）用 `track` 记进去。要回执的写入（如绑定 e 站凭据、删除与清空阅读历史）的「进行中」与失败提示用 mutation 自己的状态，一处提示只留最近一次提交的结果。写入不接 `AbortSignal`，离开页面不取消已经发出的保存；保存有 10 秒时限，挂住的才中止，免得后面排队的保存、等着写入落地才读的数据全跟着卡住。

换本站账号时，`auth` 的 store 先清空整个查询缓存（取消在途读取、删掉全部条目），再让 `AppLayout` 的 KeepAlive 按新 key 把页面整个重建；顺序不能反，否则新页面会先看见上一个账号的数据。还在排队的写入发出前发现账号换了就不再发：它会带着新账号的令牌出去。

## 测试

测试在 `tests/`，替身是 mock 掉 `api.ts` 或全局的 `fetch`（Eden 按 `fetch(地址, 选项)` 调用）；happy-dom 不做布局，靠滚动位置或可见性触发的 `@vueuse/core` 函数（`useInfiniteScroll`、`useIntersectionObserver`）也 mock 掉，把回调接出来由测试手动触发；挂应用时和 `main.ts` 一样经 `installQueries` 装上查询库；只测组合式函数的用 `composableTests()`，它每个用例换一个 pinia，收尾前先等排着队的写入落地（否则它们会跨到下一个用例才发出）。`tests/support.ts` 放共用的测试工具：`deferred` 摆出「请求在途」「旧响应迟到」这类时序，`query`、`byText` 取测试要操作的元素、`present` 取测试依赖的值，找不到都当场失败并说清缺了什么。
