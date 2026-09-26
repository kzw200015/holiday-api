# Repository Guidelines

## 项目结构

MyAPI 提供账号、图集浏览和节假日查询。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。仓库是 Bun 工作区（见 ADR-0003、ADR-0004），三个包：

- `apps/server`：后端，Elysia + Drizzle + PostgreSQL，由 Bun 直接运行 TypeScript 源码。前端经 Eden 从后端导出的 `App` 类型推断每条接口（见 ADR-0007）。
- `apps/web`：前端，Vue 3 + Vite。前端工具链（Vite、vue-tsc、Vitest）跑在 Node 上：vue-tsc 在 Bun 下认不出 `.vue`，所以本机除了 Bun 还要装 Node 24。
- `packages/shared`（包名 `@myapi/shared`）：前后端共用的请求 zod schema、响应的类型与两端都要执行的规则，不构建，两端直接引用源码。

Bun 的版本写在根目录 `package.json` 的 `packageManager` 与 `Dockerfile` 的两处 `oven/bun` 镜像标签里，升级时三处一起改。

镜像里前端产物放在后端旁边（`apps/server/client`），由后端统一提供 API 与静态文件。后端的领域模块（`auth`、`eh`、`holiday`）与前端的 feature 一一对应。

各包与领域模块的约定写在各自目录下的 `AGENTS.md` 里。本文件只放全仓通用的部分；动手改某处之前，从包到领域逐级读完对应的 `AGENTS.md`：

- `apps/server/AGENTS.md`：后端结构与装配、Elysia 的用法（配置、入参、响应、鉴权、数据、出网、缓存）、后端测试、本地配置。
- `apps/server/src/eh/AGENTS.md`：与 e 站打交道的协议层、上游失败与文案、图片代理、图集元数据与凭据的读取。
- `apps/web/AGENTS.md`：前端结构与分层、对后端的依赖、组件与界面规范、数据层通则（读取、作废、写入）、前端测试。
- `apps/web/src/features/eh/AGENTS.md`：本站账号数据、图集详情、阅读进度与阅读历史、换绑 e 站账号时的作废。
- `packages/shared/AGENTS.md`：共享包的引用方式、schema 与类型的写法。

## 构建与测试命令

在仓库根目录执行：

- `bun install --frozen-lockfile`：按锁文件安装。
- `bun run dev`：同时启动后端（`bun --watch`，监听 8000，读 `apps/server/.env`）与 Vite（`/api` 代理到 `localhost:8000`）；共享包是源码，改了两边直接看见。
- `bun run build`：构建前端（含类型检查）。后端与共享包不构建，由 Bun 直接运行源码。
- `bun run typecheck`：三个包的类型检查。Bun 运行 TypeScript 时不检查类型，后端与共享包只有这一处能发现类型错误。
- `bun run test`：三个包的 Vitest 各跑一次，后端的跑在 Bun 下，另两个跑在 Node 下。后端测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。
- `bun run lint` / `bun run lint:fix`（oxlint）、`bun run format` / `bun run format:check`（Prettier），全仓一份配置。

只动一个包时可以用 `bun --filter <包名> <脚本>`（包名是 `server`、`web`、`@myapi/shared`），只跑一个测试文件时在包目录下直接调 Vitest，例如在 `apps/server` 下 `bun --bun vitest run test/images.test.ts`。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行、两空格缩进。注释、提交信息与文档使用简体中文。

格式由根目录的 Prettier 统一（无分号、双引号、120 列），import 顺序由 `@ianvs/prettier-plugin-sort-imports` 自动排，不要手工调整；lint 规则见根目录的 `.oxlintrc.json`，其中 `curly` 要求所有 `if`/`for` 带花括号。TypeScript 标识符用 camelCase，脚本注释用 `/* */`（导出 API 用 `/** */`）。

所有编译配置都开着 `strict` 与 `noUncheckedIndexedAccess`：按下标、解构、正则捕获组取到的值都可能是 `undefined`。不写 `!` 非空断言、`let x!:` 明确赋值断言，也不用 `as [number, number]` 这类元组断言冒充「一定有」，取不到的情况显式处理——产品代码按业务给出合理的结果或抛错，测试里经各包测试支撑的 `present` 一类辅助函数当场失败并说清缺了什么。`catch` 到的值不一定是 `Error`，不直接 `as Error`。

## 测试

测试命名为 `*.test.ts`（Vitest）。重点验证可观察行为，尤其是鉴权、请求取消、缓存和导航回归。外部依赖一律换成确定性的替身，不引 mock 库。各包的测试接缝与替身见各自的 `AGENTS.md`。

提交前运行相关测试，并通过根目录的 `bun run lint`、`bun run format:check`、`bun run typecheck` 与 `bun run build`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue，界面变化附截图。

## 安全

禁止提交凭据。本地配置与部署用的环境变量见 `apps/server/AGENTS.md`。
