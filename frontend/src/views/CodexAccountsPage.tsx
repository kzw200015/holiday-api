import { defineComponent } from "vue"
import { ElTag, ElText } from "element-plus"

import CodexAccountsCard from "@/views/codex-accounts/CodexAccountsCard.tsx"
import CodexResponseLogsCard from "@/views/codex-accounts/CodexResponseLogsCard.tsx"
import CodexTokenUsageCard from "@/views/codex-accounts/CodexTokenUsageCard.tsx"

export default defineComponent({
  name: "CodexAccountsPage",
  setup() {
    return () => (
      <section class="space-y-4">
        <header class="flex items-center gap-2">
          <ElText class="text-2xl font-semibold tracking-tight">Codex 账户</ElText>
          <ElTag type="info">管理面板</ElTag>
        </header>

        <CodexTokenUsageCard/>
        <CodexAccountsCard/>
        <CodexResponseLogsCard/>
      </section>
    )
  },
})
