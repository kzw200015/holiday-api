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
            <ElContainer class="app-shell">
                <ElAside class="app-shell__aside" width={asideWidth.value}>
                    <AppSidebar collapsed={appStore.sidebarCollapsed} />
                </ElAside>

                <ElContainer>
                    <ElHeader class="app-shell__header">
                        <div class="app-shell__header-left">
                            <ElButton circle text onClick={appStore.toggleSidebarCollapsed}>
                                <ElIcon>
                                    <CollapseIcon.value />
                                </ElIcon>
                            </ElButton>
                            <ElText>控制台</ElText>
                        </div>
                        <div class="app-shell__header-right">
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

                    <ElMain class="app-shell__main">
                        <RouterView />
                    </ElMain>
                </ElContainer>
            </ElContainer>
        )
    },
})
