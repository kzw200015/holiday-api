import { computed, defineComponent, onMounted } from "vue"
import { RouterView } from "vue-router"
import { Expand, Fold } from "@element-plus/icons-vue"
import { ElButton, ElIcon, ElSwitch } from "element-plus"

import AppSidebar from "@/components/AppSidebar"
import { useAppStore } from "@/stores/AppStore"

export default defineComponent({
    name: "AppLayout",
    setup() {
        const appStore = useAppStore()

        onMounted(() => {
            appStore.initializeTheme()
        })

        const asideWidth = computed(() => (appStore.sidebarCollapsed ? "64px" : "240px"))
        const CollapseIcon = computed(() => (appStore.sidebarCollapsed ? Expand : Fold))

        return () => (
            <div
                class="flex min-h-screen bg-slate-100 text-slate-800 dark:bg-zinc-950 dark:text-slate-100"
            >
                <aside
                    class="shrink-0 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] transition-[width] duration-200"
                    style={{ width: asideWidth.value }}
                >
                    <AppSidebar collapsed={appStore.sidebarCollapsed}/>
                </aside>

                <div class="flex min-w-0 flex-1 flex-col">
                    <header
                        class="flex h-16 shrink-0 items-center justify-between border-b border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] px-4">
                        <div class="flex items-center gap-2.5">
                            <ElButton circle text onClick={appStore.toggleSidebarCollapsed}>
                                <ElIcon>
                                    <CollapseIcon.value/>
                                </ElIcon>
                            </ElButton>
                            <span>控制台</span>
                        </div>
                        <div class="flex items-center gap-2.5">
                            <span>{appStore.isDark ? "深色主题" : "浅色主题"}</span>
                            <ElSwitch
                                modelValue={appStore.isDark}
                                inlinePrompt
                                activeText="暗"
                                inactiveText="亮"
                                onUpdate:modelValue={(value) => appStore.setDark(value as boolean)}
                            />
                        </div>
                    </header>

                    <main class="min-h-0 flex-1 p-5">
                        <RouterView/>
                    </main>
                </div>
            </div>
        )
    },
})
