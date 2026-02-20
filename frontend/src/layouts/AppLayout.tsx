import { defineComponent, onMounted, ref } from "vue"
import { RouterView, useRouter } from "vue-router"
import { ElButton, ElScrollbar, ElSwitch } from "element-plus"
import { ArrowLeftBold, ArrowRightBold, Moon, Sunny } from "@element-plus/icons-vue"

import AppSidebar from "@/components/AppSidebar"
import { useAppStore } from "@/stores/AppStore"

export default defineComponent({
  name: "AppLayout",
  setup() {
    const appStore = useAppStore()
    const router = useRouter()
    const isSidebarCollapsed = ref(false)

    onMounted(() => {
      appStore.initializeTheme()
    })

    return () => (
      <div
        class="flex h-screen flex-col bg-slate-100 text-slate-800 dark:bg-zinc-950 dark:text-slate-100"
      >
        <header
          class="flex h-16 shrink-0 items-center justify-between border-b border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] px-4"
        >
          <div
            class="flex cursor-pointer items-center"
            onClick={() => void router.push("/holiday")}
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--el-color-primary)] text-xs font-semibold text-white"
            >
              API
            </div>
            <div class="ml-2.5 grid min-w-0 whitespace-nowrap">
              <span class="text-sm font-semibold text-[var(--el-text-color-primary)]">
                控制台
              </span>
              <span class="text-xs text-[var(--el-text-color-secondary)]">
                API
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Sunny
              class={`h-4 w-4 ${appStore.isDark ? "text-[var(--el-text-color-placeholder)]" : "text-[var(--el-color-warning)]"}`}
            />
            <ElSwitch
              modelValue={appStore.isDark}
              onUpdate:modelValue={(value) => appStore.setDark(value as boolean)}
            />
            <Moon
              class={`h-4 w-4 ${appStore.isDark ? "text-[var(--el-color-primary)]" : "text-[var(--el-text-color-placeholder)]"}`}
            />
          </div>
        </header>

        <div class="flex min-h-0 flex-1">
          <aside
            class={`${isSidebarCollapsed.value ? "w-16" : "w-60"} relative shrink-0 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] transition-all duration-200`}
          >
            <div class="absolute -right-3 top-1/2 z-10 -translate-y-1/2">
              <ElButton
                circle
                size="small"
                icon={isSidebarCollapsed.value ? ArrowRightBold : ArrowLeftBold}
                class="border border-[var(--el-border-color)] bg-[var(--el-bg-color-overlay)] text-[var(--el-text-color-primary)]"
                onClick={() => {
                  isSidebarCollapsed.value = !isSidebarCollapsed.value
                }}
              />
            </div>
            <ElScrollbar class="h-full">
              <AppSidebar collapsed={isSidebarCollapsed.value}/>
            </ElScrollbar>
          </aside>

          <main class="min-h-0 min-w-0 flex-1">
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
