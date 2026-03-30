import { defineComponent, onMounted, onUnmounted, ref, watch } from "vue"
import { RouterView, useRouter } from "vue-router"
import { ElButton, ElScrollbar, ElSwitch } from "element-plus"
import { ArrowLeftBold, ArrowRightBold, Expand, Fold, Moon, Sunny } from "@element-plus/icons-vue"

import AppSidebar from "@/components/AppSidebar"
import { useAppStore } from "@/stores/AppStore"

/* 应用主布局：顶栏 + 响应式侧栏 + 内容区 */
export default defineComponent({
  setup() {
    const appStore = useAppStore()
    const router = useRouter()
    const isSidebarCollapsed = ref(false)
    const isMobileSidebarOpen = ref(false)

    const toggleSidebar = () => {
      if (appStore.isMobile) {
        isMobileSidebarOpen.value = !isMobileSidebarOpen.value
        return
      }
      isSidebarCollapsed.value = !isSidebarCollapsed.value
    }

    const closeMobileSidebar = () => {
      if (appStore.isMobile) {
        isMobileSidebarOpen.value = false
      }
    }

    onMounted(() => {
      appStore.initializeTheme()
      appStore.startResponsiveTracking()
    })

    /* 切换到桌面端时关闭移动端侧栏 */
    watch(
      () => appStore.isMobile,
      (value) => {
        if (!value) {
          isMobileSidebarOpen.value = false
        }
      },
    )

    onUnmounted(() => {
      appStore.stopResponsiveTracking()
    })

    return () => (
      <div class="flex h-screen flex-col bg-slate-100 text-slate-800 dark:bg-zinc-950 dark:text-slate-100">
        {/* 顶栏 */}
        <header class="flex h-16 shrink-0 items-center justify-between border-b border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] px-4">
          <div class="flex items-center gap-2">
            {/* 移动端汉堡按钮 */}
            <ElButton
              circle
              size="small"
              class="md:hidden"
              icon={isMobileSidebarOpen.value ? Fold : Expand}
              onClick={toggleSidebar}
            />

            {/* Logo 区域 */}
            <div
              class="flex cursor-pointer items-center"
              onClick={() => router.push("/holiday")}
            >
              <div class="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--el-color-primary)] text-xs font-semibold text-white">
                API
              </div>
              <div class="ml-2.5 grid min-w-0 whitespace-nowrap">
                <span class="text-sm font-semibold text-[var(--el-text-color-primary)]">控制台</span>
                <span class="text-xs text-[var(--el-text-color-secondary)]">API</span>
              </div>
            </div>
          </div>

          {/* 主题切换 */}
          <div class="flex items-center gap-2">
            <Sunny
              class={["h-4 w-4", appStore.isDark ? "text-[var(--el-text-color-placeholder)]" : "text-[var(--el-color-warning)]"]}
            />
            <ElSwitch
              modelValue={appStore.isDark}
              onUpdate:modelValue={(v) => appStore.setDark(v as boolean)}
            />
            <Moon
              class={["h-4 w-4", appStore.isDark ? "text-[var(--el-color-primary)]" : "text-[var(--el-text-color-placeholder)]"]}
            />
          </div>
        </header>

        <div class="relative flex min-h-0 flex-1">
          {/* 移动端遮罩层 */}
          {appStore.isMobile && isMobileSidebarOpen.value && (
            <button
              class="fixed inset-0 top-16 z-20 bg-black/20"
              aria-label="关闭侧栏"
              onClick={closeMobileSidebar}
            />
          )}

          {/* 侧栏 */}
          <aside
            class={
              appStore.isMobile
                ? `${isMobileSidebarOpen.value ? "translate-x-0" : "-translate-x-full"} fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] w-60 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] transition-transform duration-200`
                : `${isSidebarCollapsed.value ? "w-16" : "w-60"} relative shrink-0 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] transition-all duration-200`
            }
          >
            {/* 桌面端侧栏折叠按钮 */}
            {!appStore.isMobile && (
              <div class="absolute -right-3 top-1/2 z-10 -translate-y-1/2">
                <ElButton
                  circle
                  size="small"
                  icon={isSidebarCollapsed.value ? ArrowRightBold : ArrowLeftBold}
                  class="border border-[var(--el-border-color)] bg-[var(--el-bg-color-overlay)] text-[var(--el-text-color-primary)]"
                  onClick={toggleSidebar}
                />
              </div>
            )}
            <ElScrollbar class="h-full">
              <AppSidebar
                collapsed={!appStore.isMobile && isSidebarCollapsed.value}
                onMenuSelect={closeMobileSidebar}
              />
            </ElScrollbar>
          </aside>

          {/* 主内容区 */}
          <main class="min-h-0 min-w-0 flex-1">
            <ElScrollbar class="h-full">
              <div class="p-5">
                <RouterView />
              </div>
            </ElScrollbar>
          </main>
        </div>
      </div>
    )
  },
})
