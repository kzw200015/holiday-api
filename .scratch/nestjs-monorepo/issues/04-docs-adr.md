# 04: 文档与 ADR

**What to build:** 仓库文档反映新的栈与决策，后来的人与代理照着新约定工作。规格见 `../spec.md`「文档与 ADR」与「Further Notes」。

**Blocked by:** 03（用 NestJS 重写后端并切换，删除 Kotlin 版）

**Status:** resolved

- [x] 重写 `AGENTS.md`（`CLAUDE.md` 是它的软链）：项目结构（`apps/web`、`apps/server`、`packages/shared`）、根目录命令、后端约定（Nest 模块划分、共享 schema 校验、Nest 默认响应与异常、鉴权装饰器、配置与环境变量、Drizzle 迁移、缓存、出网 provider）、测试要求（Vitest、HTTP 边界主接缝、Testcontainers、样本不格式化）、配置与安全；前端约定保留，路径改为 `apps/web`
- [x] 新增 ADR-0003「后端换成 NestJS，前后端组成 monorepo 并共享 zod schema」：写明与 2026-03 那次的区别（编译后的工作区包 vs 源码直连加别名）与取舍（Nest 12 vs 11、zod vs class-validator、编译包 vs 源码包）
- [x] 改写 ADR-0001：仍不用安全框架，实现为全局 Guard + `@nestjs/jwt` + `@Public()` + `@CurrentUser()`；后果一节保留无状态令牌无法提前作废、图片靠地址签名认人
- [x] 删除 ADR-0002
- [x] 更新 `docs/agents/domain.md` 里的目录示意
- [x] `CONTEXT.md` 不改
- [x] 一个 `docs:` 提交
