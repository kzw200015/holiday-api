import { defineComponent, ref } from "vue"
import { ElButton, ElDrawer, ElTag, ElText } from "element-plus"

import CodexAccountsCard from "@/views/codex-accounts/CodexAccountsCard.tsx"
import CodexPromptConfigCard from "@/views/codex-accounts/CodexPromptConfigCard.tsx"
import CodexResponseLogsCard from "@/views/codex-accounts/CodexResponseLogsCard.tsx"
import CodexTokenUsageCard from "@/views/codex-accounts/CodexTokenUsageCard.tsx"

export default defineComponent({
  name: "CodexAccountsPage",
  setup() {
    const promptConfigDrawerVisible = ref(false)

    return () => (
      <section class="space-y-4">
        <header class="flex flex-wrap items-center gap-2">
          <ElText class="text-2xl font-semibold tracking-tight">Codex 账户</ElText>
          <ElTag type="info">管理面板</ElTag>
          <ElButton
            class="ml-auto"
            type="primary"
            plain
            onClick={() => {
              promptConfigDrawerVisible.value = true
            }}
          >
            系统提示词配置
          </ElButton>
        </header>

        <CodexTokenUsageCard/>
        <CodexAccountsCard/>
        <CodexResponseLogsCard/>

        <ElDrawer
          title="系统提示词配置"
          size="640px"
          destroyOnClose
          v-model={promptConfigDrawerVisible.value}
        >
          <CodexPromptConfigCard/>
        </ElDrawer>
      </section>
    )
  },
})
