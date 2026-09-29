# Repository Guidelines

## 项目结构

MyAPI 提供节假日查询，是一个纯 API 服务。领域术语见 `CONTEXT.md`，架构决策见 `docs/adr/`，辅助工作流见 `docs/agents/`。仓库是 Bun 工作区（见 ADR-0003、ADR-0004），只有一个包：

- `apps/server`：后端，Hono + Drizzle + PostgreSQL，由 Bun 直接运行 TypeScript 源码（见 ADR-0008）。

Bun 的版本写在根目录 `package.json` 的 `packageManager` 与 `Dockerfile` 的 `oven/bun` 镜像标签里，升级时两处一起改。

各包与领域模块的约定写在各自目录下的 `AGENTS.md` 里。本文件只放全仓通用的部分；动手改某处之前，读完对应的 `AGENTS.md`：

- `apps/server/AGENTS.md`：后端结构与模块组织、Hono 的用法（配置、入参、响应、数据、出网、定时任务）、后端测试、本地配置。

## 构建与测试命令

在仓库根目录执行：

- `bun install --frozen-lockfile`：按锁文件安装。
- `bun run dev`：启动后端（`bun --watch`，监听 8000，读 `apps/server/.env`）。
- `bun run typecheck`：类型检查。Bun 运行 TypeScript 时不检查类型，只有这一处能发现类型错误。
- `bun run test`：Vitest 跑在 Bun 下。测试用 Testcontainers 起 PostgreSQL，需要本机 Docker。
- `bun run lint` / `bun run lint:fix`（oxlint）、`bun run format` / `bun run format:check`（Prettier），全仓一份配置。

没有构建步骤：后端由 Bun 直接运行源码。只跑一个测试文件时在包目录下直接调 Vitest，例如在 `apps/server` 下 `bun --bun vitest run test/holiday.test.ts`。

## 代码风格

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行、两空格缩进。注释、提交信息与文档使用简体中文。

格式由根目录的 Prettier 统一（无分号、双引号、120 列），import 顺序由 `@ianvs/prettier-plugin-sort-imports` 自动排，不要手工调整；lint 规则见根目录的 `.oxlintrc.jsonc`，其中 `curly` 要求所有 `if`/`for` 带花括号。TypeScript 标识符用 camelCase；文件名不用点分隔角色（写 `holiday-service.ts`，不写 `holiday.service.ts`），点只留给扩展名和工具认的后缀（`.test.ts`、`.config.ts`、`.d.ts`）。脚本注释用 `/* */`（导出 API 用 `/** */`）。

编译配置开着 `strict` 与 `noUncheckedIndexedAccess`：按下标、解构、正则捕获组取到的值都可能是 `undefined`。不写 `!` 非空断言、`let x!:` 明确赋值断言，也不用 `as [number, number]` 这类元组断言冒充「一定有」，取不到的情况显式处理——产品代码按业务给出合理的结果或抛错，测试里经测试支撑的 `present` 当场失败并说清缺了什么。`catch` 到的值不一定是 `Error`，不直接 `as Error`。

## 测试

测试命名为 `*.test.ts`（Vitest）。重点验证可观察行为：接口的响应、库里的最终状态、启动与定时刷新。外部依赖一律换成确定性的替身，不引 mock 库。测试接缝与替身见 `apps/server/AGENTS.md`。

提交前运行相关测试，并通过根目录的 `bun run lint`、`bun run format:check` 与 `bun run typecheck`。

## 提交与 Pull Request

沿用 `feat:`、`fix:`、`refactor:`、`chore:` 前缀，用简体中文概述改动，每次提交只做一件事。PR 说明解决的问题、改动后的行为和验证结果，关联相关 issue。

## 安全

禁止提交凭据。本地配置与部署用的环境变量见 `apps/server/AGENTS.md`。
