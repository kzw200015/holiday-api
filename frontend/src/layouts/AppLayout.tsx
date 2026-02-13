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

        const asideWidth = computed(() => (appStore.sidebarCollapsed ? "72px" : "240px"))
        const CollapseIcon = computed(() => (appStore.sidebarCollapsed ? Expand : Fold))

        return () => (
            <div
                class="grid min-h-screen bg-slate-100 text-slate-800 transition-[grid-template-columns] duration-200 dark:bg-zinc-950 dark:text-slate-100"
                style={{
                    gridTemplateColumns: `${asideWidth.value} minmax(0, 1fr)`,
                    gridTemplateRows: "auto minmax(0, 1fr)",
                }}
            >
                <aside
                    class="row-span-2 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)]"
                >
                    <AppSidebar collapsed={appStore.sidebarCollapsed}/>
                </aside>

                <header class="col-start-2 flex h-16 items-center justify-between border-b border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] px-4">
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

                <main class="col-start-2 min-h-0 p-5">
                    <RouterView/>
                </main>
            </div>
        )
    },
})
