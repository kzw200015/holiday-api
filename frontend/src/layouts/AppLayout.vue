<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue"
import { RouterView, useRouter } from "vue-router"
import { ElButton, ElScrollbar, ElSwitch } from "element-plus"
import { ArrowLeftBold, ArrowRightBold, Expand, Fold, Moon, Sunny } from "@element-plus/icons-vue"

import AppSidebar from "@/components/AppSidebar.vue"
import { useAppStore } from "@/stores/AppStore"

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
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-100 text-slate-800 dark:bg-zinc-950 dark:text-slate-100">
    <header
      class="flex h-16 shrink-0 items-center justify-between border-b border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] px-4"
    >
      <div class="flex items-center gap-2">
        <ElButton
          circle
          size="small"
          class="md:hidden"
          :icon="isMobileSidebarOpen ? Fold : Expand"
          @click="toggleSidebar"
        />

        <div
          class="flex cursor-pointer items-center"
          @click="router.push('/holiday')"
        >
          <div
            class="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--el-color-primary)] text-xs font-semibold text-white"
          >
            API
          </div>
          <div class="ml-2.5 grid min-w-0 whitespace-nowrap">
            <span class="text-sm font-semibold text-[var(--el-text-color-primary)]">控制台</span>
            <span class="text-xs text-[var(--el-text-color-secondary)]">API</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Sunny
          :class="['h-4 w-4', appStore.isDark ? 'text-[var(--el-text-color-placeholder)]' : 'text-[var(--el-color-warning)]']"
        />
        <ElSwitch
          :model-value="appStore.isDark"
          @update:model-value="(v) => appStore.setDark(v as boolean)"
        />
        <Moon
          :class="['h-4 w-4', appStore.isDark ? 'text-[var(--el-color-primary)]' : 'text-[var(--el-text-color-placeholder)]']"
        />
      </div>
    </header>

    <div class="relative flex min-h-0 flex-1">
      <!-- 移动端遮罩层 -->
      <button
        v-if="appStore.isMobile && isMobileSidebarOpen"
        class="fixed inset-0 top-16 z-20 bg-black/20 md:hidden"
        aria-label="关闭侧栏"
        @click="closeMobileSidebar"
      />

      <aside
        :class="appStore.isMobile
          ? `${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] w-60 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] transition-transform duration-200`
          : `${isSidebarCollapsed ? 'w-16' : 'w-60'} relative shrink-0 border-r border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] transition-all duration-200`"
      >
        <!-- 桌面端侧栏折叠按钮 -->
        <div v-if="!appStore.isMobile" class="absolute -right-3 top-1/2 z-10 -translate-y-1/2">
          <ElButton
            circle
            size="small"
            :icon="isSidebarCollapsed ? ArrowRightBold : ArrowLeftBold"
            class="border border-[var(--el-border-color)] bg-[var(--el-bg-color-overlay)] text-[var(--el-text-color-primary)]"
            @click="toggleSidebar"
          />
        </div>
        <ElScrollbar class="h-full">
          <AppSidebar
            :collapsed="!appStore.isMobile && isSidebarCollapsed"
            @menu-select="closeMobileSidebar"
          />
        </ElScrollbar>
      </aside>

      <main class="min-h-0 min-w-0 flex-1">
        <ElScrollbar class="h-full">
          <div class="p-5">
            <RouterView />
          </div>
        </ElScrollbar>
      </main>
    </div>
  </div>
</template>
