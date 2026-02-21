import { defineComponent } from "vue"
import { ElTag, ElText } from "element-plus"

import CodexResponseLogsCard from "@/views/codex/components/CodexResponseLogsCard.tsx"

export default defineComponent({
  name: "CodexResponseLogsPage",
  setup() {
    return () => (
      <section class="space-y-4">
        <header class="flex flex-wrap items-center gap-2">
          <ElText class="text-2xl font-semibold tracking-tight">Codex 调用日志</ElText>
          <ElTag type="info">审计面板</ElTag>
        </header>

        <CodexResponseLogsCard/>
      </section>
    )
  },
})
