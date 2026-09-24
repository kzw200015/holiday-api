# apps/web

前端：Vue 3 + Vite。全仓通用的约定见根目录 `AGENTS.md`，图集浏览的数据细节另见 `src/features/eh/AGENTS.md`。

## 结构

`src/` 分三块：`app/` 是应用装配（路由、全局布局、导航目录、主题）；`features/` 下每块业务自成一体（`auth`、`eh`、`holiday`，与后端领域模块对应）；`shared/` 放与业务无关的通用能力（HTTP 客户端、读取与写入排队的工具、通用组件与组合式函数、`lib/` 下的格式化与错误处理小工具）。`src/components/ui/` 与 `src/lib/utils.ts` 是 shadcn-vue 生成的源码，保持原样：已排除在 Prettier 与 oxlint 之外，清理代码或用 IDE 格式化时也别碰。静态资源在 `public/`，测试在 `tests/`。

feature 内按角色分文件：`api.ts` 只管 HTTP 调用，领域类型直接从 `@myapi/shared` 取，`labels.ts` 一类放展示用的中文词汇，`store.ts` 放跨页面共享的状态（pinia），`composables/` 把数据和交互包成页面能直接用的形状，`components/` 与 `views/` 是界面。依赖只有一个方向：`views` → `composables` → `api`/`store` → `shared/`，页面不直接调接口，`shared/` 不反向引用 `features/` 或 `app/`（`@myapi/shared` 是独立的包，哪一层都可以引用）。多个 feature 拼到一个界面上只在 `app/` 层发生（如设置页同时用 `auth` 与 `eh`）；feature 之间唯一允许的引用是依赖 `auth` 的会话状态，因为换账号要让各自的缓存与在途请求作废。

## 组件与界面

组件文件名用 PascalCase，组合式函数用 `useX`。业务组件用 `<script setup lang="ts">`，组件名从文件名推导，KeepAlive 按它匹配，需要别的名字时用 `defineOptions`；props、emits 与双向绑定用类型化的 `defineProps`、`defineEmits`、`defineModel`，不用渲染函数模拟模板。使用 `@/` 路径别名（只在 tsconfig 的 `paths` 里定义，Vite 经 `resolve.tsconfigPaths` 解析），SFC 导入显式带 `.vue`。模板注释用 `<!-- -->`。

危险操作的按钮用 `variant="destructive"`（红字、无底色，独立按钮再加一圈淡红描边）；代价大、不可撤销的（清空、解绑）先经 `shared/components/ConfirmDialog` 确认，只有对话框里的确认键是实心红。「回上一级」按钮在顶栏，由路由的 `meta.back` 声明，页面里不另放一份；浏览器历史的上一条正好是目标页时退回去，否则原地替换（`shared/composables/useGoBack`），历史里不留重复的一条。

## 数据层

服务端数据的读取只写在 feature 的 `composables/` 里，页面拿到的是包好的 `loading`、`errorMessage` 与数据。数据放在哪，看它要在哪些页面之间共用：只在一个页面里用的（评论、节假日、搜索结果、阅读历史）活在组件里，单次读取用 `shared/composables/useRequest`，列表一律触底加载、用 `useCursorPages`，不做上一页下一页；页面被 KeepAlive 留着，界面状态（输入草稿、滚动位置、展开状态）和数据也就一起留着，不另设缓存。跨页面共用的放 feature 的 `store.ts`。「旧响应不算数」只由 `shared/api/request.ts` 的 `createRequest` 负责：同一路读取只认最后发起的那次，参数一变、组件销毁或 store 作废就取消在途请求，迟到的响应什么也不写，页面和 store 不再自己比对 signal 或数版本号。不自动重试，也不在窗口聚焦或网络重连时重取，失败交给用户点重试。HTTP 客户端把失败一律变成带中文说明的 `Error`；`catch` 到的值经 `shared/lib/errors.ts` 的 `toError` 统一后再取文案。

换本站账号时，各 store 监听 `auth` 的 `pageRevision` 自己清空、取消在途读取，并丢掉还在排队的写入（它们要等前一次回来才发，那时已经带上新账号的令牌了），页面由 `AppLayout` 的 KeepAlive 按新 key 整个重建。这个监听必须 `flush: "sync"`：store 是在某个页面里第一次创建的，普通 watcher 会排在那个页面之后才跑，新页面就会先看见旧数据、不再去读。

要回执的写入（如绑定 e 站凭据、删除与清空阅读历史）在组合式函数里自己记「进行中」与失败提示，并显示成败，一处提示只留最近一次提交的结果。写入不接 `AbortSignal`，离开页面不取消已经发出的保存；保存有 10 秒时限，挂住的才中止，免得同一条队后面的保存、等着前一次落地才读的数据全跟着卡住。

## 测试

测试在 `tests/`，替身是 mock 掉 `api.ts` 或 HTTP 适配器。`tests/support.ts` 放共用的测试工具：`deferred` 摆出「请求在途」「旧响应迟到」这类时序，`query`、`byText` 取测试要操作的元素、`present` 取测试依赖的值，找不到都当场失败并说清缺了什么。
