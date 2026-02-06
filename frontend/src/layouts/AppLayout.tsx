import { computed, defineComponent, onMounted } from "vue"
import { RouterView } from "vue-router"
import { Expand, Fold } from "@element-plus/icons-vue"
import { ElAside, ElButton, ElContainer, ElHeader, ElIcon, ElMain, ElSwitch, ElText } from "element-plus"

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
            <ElContainer class="min-h-screen bg-gradient-to-b from-slate-50 to-slate-200 text-slate-800 dark:from-zinc-900 dark:to-zinc-950 dark:text-slate-100">
                <ElAside
                    class="border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] transition-[width] duration-200"
                    width={asideWidth.value}
                >
                    <AppSidebar collapsed={appStore.sidebarCollapsed} />
                </ElAside>

                <ElContainer>
                    <ElHeader class="flex items-center justify-between border-b border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] px-4">
                        <div class="flex items-center gap-2.5">
                            <ElButton circle text onClick={appStore.toggleSidebarCollapsed}>
                                <ElIcon>
                                    <CollapseIcon.value />
                                </ElIcon>
                            </ElButton>
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
                    </ElHeader>

                    <ElMain class="p-5">
                        <RouterView />
                    </ElMain>
                </ElContainer>
            </ElContainer>
        )
    },
})
