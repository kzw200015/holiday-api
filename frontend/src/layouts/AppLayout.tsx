import { defineComponent, onMounted } from "vue"
import { RouterView } from "vue-router"
import { ElScrollbar, ElSwitch, ElText } from "element-plus"

import AppSidebar from "@/components/AppSidebar"
import { useAppStore } from "@/stores/AppStore"

export default defineComponent({
  name: "AppLayout",
  setup() {
    const appStore = useAppStore()

    onMounted(() => {
      appStore.initializeTheme()
    })

    return () => (
      <div
        class="flex h-screen bg-slate-100 text-slate-800 dark:bg-zinc-950 dark:text-slate-100"
      >
        <aside
          class="w-60 shrink-0 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)]"
        >
          <ElScrollbar class="h-full">
            <AppSidebar/>
          </ElScrollbar>
        </aside>

        <div class="flex min-w-0 flex-1 flex-col">
          <header
            class="flex h-16 shrink-0 items-center justify-between border-b border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] px-4">
            <div class="flex items-center">
              <ElText>控制台</ElText>
            </div>
            <div class="flex items-center gap-2.5">
              <ElText>{appStore.isDark ? "深色主题" : "浅色主题"}</ElText>
              <ElSwitch
                modelValue={appStore.isDark}
                inlinePrompt
                activeText="暗"
                inactiveText="亮"
                onUpdate:modelValue={(value) => appStore.setDark(value as boolean)}
              />
            </div>
          </header>

          <main class="min-h-0 flex-1">
            <ElScrollbar class="h-full">
              <div class="p-5">
                <RouterView/>
              </div>
            </ElScrollbar>
          </main>
        </div>
      </div>
    )
  },
})
