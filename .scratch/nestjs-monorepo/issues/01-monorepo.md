# 01: 改成 pnpm monorepo

**What to build:** 仓库变成 pnpm 工作区，现有前端整体迁入 `apps/web`，在新位置照常开发、构建、测试、打镜像。Kotlin 后端暂不动。规格见 `../spec.md`「仓库与工具链」。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 前端整体迁入 `apps/web`，内部结构与约定不变（`@/` 别名、shadcn-vue 生成物排除在格式化与 lint 之外）
- [ ] `packageManager`、锁文件、工作区设置（含允许构建脚本的名单）提到根目录，`pnpm install --frozen-lockfile` 在根目录可用
- [ ] 根目录一份 Prettier（无分号、双引号、120 列、import 自动排序）与一份 oxlint 配置，替代前端目录下的那份，格式结果与迁移前一致
- [ ] 根目录聚合脚本：dev、build、test、lint、format、format:check
- [ ] Dockerfile 的前端构建阶段改用新路径，镜像照常构建、照常把前端产物放进 Kotlin jar
- [ ] `.gitignore`、`.dockerignore` 按新路径更新
- [ ] 根目录下 `pnpm build`、`pnpm test`、`pnpm lint`、`pnpm format:check` 全部通过；Kotlin 后端 `./gradlew test` 仍通过
- [ ] 独立一个 `refactor:` 提交
