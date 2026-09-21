<script setup lang="ts">
import { ArrowLeftIcon, MoonIcon, SunIcon } from "@lucide/vue"
import { RouterView, useRoute, useRouter } from "vue-router"

import AppSidebar from "@/app/layouts/AppSidebar.vue"
import { useThemeStore } from "@/app/themeStore"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useAuthStore } from "@/features/auth/store"

const appStore = useThemeStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

/* 用 replace：回上一级不该在浏览器历史里再垫一层，否则按后退又回到刚离开的页面。 */
function goBack() {
  if (route.meta.back) {
    void router.replace(route.meta.back.to(route))
  }
}
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger class="-ml-1" />
        <Separator
          class="mr-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <Button v-if="route.meta.back" class="-ml-1" size="icon-sm" variant="ghost" @click="goBack">
          <ArrowLeftIcon />
          <span class="sr-only">{{ route.meta.back.label }}</span>
        </Button>
        <h1 class="flex-1 truncate text-sm font-medium">{{ route.meta.title ?? "" }}</h1>
        <Button aria-label="切换主题" size="icon-sm" variant="ghost" @click="appStore.setDark(!appStore.isDark)">
          <SunIcon v-if="appStore.isDark" />
          <MoonIcon v-else />
        </Button>
      </header>
      <div class="flex flex-1 flex-col gap-4 p-4">
        <RouterView v-slot="{ Component }">
          <!-- 按上层组件身份缓存，不使用叶子路由名；账号变化时整体清空。 -->
          <KeepAlive :key="authStore.pageRevision">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
