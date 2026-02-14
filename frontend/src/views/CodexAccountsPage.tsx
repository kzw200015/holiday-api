import { defineComponent } from "vue"
import { ElTag, ElText } from "element-plus"

import CodexAccountsCard from "@/views/codex-accounts/CodexAccountsCard.tsx"
import CodexResponseLogsCard from "@/views/codex-accounts/CodexResponseLogsCard.tsx"
import CodexTokenUsageCard from "@/views/codex-accounts/CodexTokenUsageCard.tsx"

export default defineComponent({
  name: "CodexAccountsPage",
  setup() {
    return () => (
      <section>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <ElText class="m-0 text-2xl font-semibold tracking-tight">Codex 账户</ElText>
              <ElTag type="info">管理面板</ElTag>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="md:col-span-2">
              <CodexTokenUsageCard/>
            </div>

            <div class="md:col-span-2">
              <CodexAccountsCard/>
            </div>

            <div class="md:col-span-2">
              <CodexResponseLogsCard/>
            </div>
          </div>
        </div>
      </section>
    )
  },
})
