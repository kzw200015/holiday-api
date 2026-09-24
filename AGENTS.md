# Repository Guidelines

## 项目结构

MyAPI 提供账号、图集浏览和节假日查询。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。仓库是 pnpm 工作区（见 ADR-0003），三个包：

- `apps/server`：后端，NestJS 12（Express 适配器）+ Drizzle + PostgreSQL，全仓 ESM、Node 24。
- `apps/web`：前端，Vue 3 + Vite。
- `packages/shared`（包名 `@myapi/shared`）：前后端共用的接口契约——请求的 zod schema 与响应的类型。

镜像里前端产物放在后端旁边（`apps/server/client`），由后端统一提供 API 与静态文件。后端的领域模块（`auth`、`eh`、`holiday`）与前端的 feature 一一对应。

各包与领域模块的约定写在各自目录下的 `AGENTS.md` 里。本文件只放全仓通用的部分；动手改某处之前，从包到领域逐级读完对应的 `AGENTS.md`：

- `apps/server/AGENTS.md`：后端结构、Nest 的用法（配置、入参、响应、鉴权、数据、出网、缓存）、后端测试、本地配置。
- `apps/server/src/eh/AGENTS.md`：与 e 站打交道的协议层、上游失败与文案、图片代理、图集元数据与凭据的读取。
- `apps/web/AGENTS.md`：前端结构与分层、组件与界面规范、数据层通则（读取、作废、写入）、前端测试。
- `apps/web/src/features/eh/AGENTS.md`：本站账号数据、图集详情、阅读进度与阅读历史、换绑 e 站账号时的作废。
- `packages/shared/AGENTS.md`：共享包的构建与引用方式、schema 与命名类型的约定。

## 构建与测试命令

在仓库根目录执行：

- `pnpm install --frozen-lockfile`：用 `packageManager` 指定的 pnpm 版本按锁文件安装。
- `pnpm dev`：同时启动共享包的 watch、后端（`nest start --watch`，监听 8000，读 `apps/server/.env`）与 Vite（`/api` 代理到 `localhost:8000`）。
- `pnpm build`：按依赖顺序构建共享包、后端、前端（前端含类型检查）。
- `pnpm test`：三个包的 Vitest 各跑一次。后端测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。
- `pnpm lint` / `pnpm lint:fix`（oxlint）、`pnpm format` / `pnpm format:check`（Prettier），全仓一份配置。

只动一个包时可以用 `pnpm --filter <包名> <脚本>`（包名是 `server`、`web`、`@myapi/shared`），例如 `pnpm --filter server exec vitest run test/images.test.ts` 只跑一个测试文件。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行、两空格缩进。注释、提交信息与文档使用简体中文。

格式由根目录的 Prettier 统一（无分号、双引号、120 列），import 顺序由 `@ianvs/prettier-plugin-sort-imports` 自动排，不要手工调整；lint 规则见根目录的 `.oxlintrc.json`，其中 `curly` 要求所有 `if`/`for` 带花括号。TypeScript 标识符用 camelCase，脚本注释用 `/* */`（导出 API 用 `/** */`）。

所有编译配置都开着 `strict` 与 `noUncheckedIndexedAccess`：按下标、解构、正则捕获组取到的值都可能是 `undefined`。不写 `!` 非空断言、`let x!:` 明确赋值断言，也不用 `as [number, number]` 这类元组断言冒充「一定有」，取不到的情况显式处理——产品代码按业务给出合理的结果或抛错，测试里经各包测试支撑的 `present` 一类辅助函数当场失败并说清缺了什么。`catch` 到的值不一定是 `Error`，不直接 `as Error`。

## 测试

测试命名为 `*.test.ts`（Vitest）。重点验证可观察行为，尤其是鉴权、请求取消、缓存和导航回归。外部依赖一律换成确定性的替身，不引 mock 库。各包的测试接缝与替身见各自的 `AGENTS.md`。

提交前运行相关测试，并通过根目录的 `pnpm lint`、`pnpm format:check` 与 `pnpm build`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue，界面变化附截图。

## 安全

禁止提交凭据。本地配置与部署用的环境变量见 `apps/server/AGENTS.md`。
