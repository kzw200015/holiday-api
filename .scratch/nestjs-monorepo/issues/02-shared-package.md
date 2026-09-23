# 02: 共享包，前端改为从共享包取类型

**What to build:** 新增共享包，承载响应类型与请求 zod schema；前端的领域类型与提交前的预校验都改为从共享包取，读者看到的行为不变。规格见 `../spec.md`「共享包」。

**Blocked by:** 01（改成 pnpm monorepo）

**Status:** ready-for-agent

- [ ] `packages/shared` 是标准工作区包：`tsc` 编译到 `dist`，ESM，经 `exports` 暴露类型与产物；不用 tsconfig paths 或 vite alias 直连源码
- [ ] 响应类型：图集卡片、详情、评论片段、e 站凭据绑定状态、偏好、阅读历史、分页结果、本站账号、节假日安排等，从前端 `model.ts` 迁入，形状不变
- [ ] 请求 schema（zod 4）：注册与登录、e 站凭据、图集搜索、偏好、搜索历史、进度上报、阅读历史游标、节假日日期；规则与 Kotlin 后端现行校验一致，中文文案写在 schema 里
- [ ] 长度口径正确：密码按 code point，关键词与搜索历史按 UTF-8 字节；日期按严格 ISO 日历日期（拒绝 `2026-02-30`、`2026-1-4`）
- [ ] 前端各 feature 的 `model.ts` 改为从共享包取类型（或直接删除、改由共享包导出），依赖方向仍是 `views` → `composables` → `api`/`store` → `shared/`
- [ ] 搜索词、搜索历史、自动翻页间隔的前端预校验改用共享 schema，原先手写的规则删掉
- [ ] 根目录 dev 脚本带上共享包 watch；build 按依赖顺序先构建共享包
- [ ] 为共享 schema 的边界补测试（放在现有 `useSearchHistory`、`useGalleryPreferences`、`useGallerySearch` 等测试里，或共享包自身），前端现有测试全部通过
- [ ] `pnpm build`、`pnpm test`、`pnpm lint`、`pnpm format:check` 全部通过
- [ ] 独立一个 `feat:` 提交
