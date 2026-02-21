import { computed, defineComponent, ref } from "vue"
import { ElButton, ElDrawer, ElTag, ElText } from "element-plus"

import { useAppStore } from "@/stores/AppStore"
import CodexAccountsCard from "@/views/codex/components/CodexAccountsCard.tsx"
import CodexPromptConfigCard from "@/views/codex/components/CodexPromptConfigCard.tsx"
import CodexTokenUsageCard from "@/views/codex/components/CodexTokenUsageCard.tsx"

export default defineComponent({
  name: "CodexAccountsPage",
  setup() {
    const appStore = useAppStore()
    const promptConfigDrawerVisible = ref(false)
    const promptConfigDrawerSize = computed(() => (appStore.isMobile ? "92vw" : "640px"))

    return () => (
      <section class="space-y-4">
        <header class="flex flex-wrap items-center gap-2">
          <ElText class="text-2xl font-semibold tracking-tight">Codex 账户</ElText>
          <ElTag type="info">管理面板</ElTag>
          <ElButton
            class="ml-auto"
            type="primary"
            onClick={() => {
              promptConfigDrawerVisible.value = true
            }}
          >
            系统提示词配置
          </ElButton>
        </header>

        <CodexTokenUsageCard/>
        <CodexAccountsCard/>

        <ElDrawer
          title="系统提示词配置"
          size={promptConfigDrawerSize.value}
          appendToBody
          destroyOnClose
          v-model={promptConfigDrawerVisible.value}
        >
          <CodexPromptConfigCard/>
        </ElDrawer>
      </section>
    )
  },
})
