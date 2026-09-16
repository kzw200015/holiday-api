<script setup lang="ts">
import { MoonIcon, SunIcon } from "@lucide/vue"
import { RouterView, useRoute, type RouteLocationNormalizedLoaded } from "vue-router"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import AppSidebar from "@/layouts/AppSidebar.vue"
import { useAppStore } from "@/stores/AppStore"
import { useAuthStore } from "@/stores/AuthStore"

const appStore = useAppStore()
const authStore = useAuthStore()
const route = useRoute()

function isGalleryRoute(viewRoute: RouteLocationNormalizedLoaded) {
  return viewRoute.name === "gallery-list" || viewRoute.name === "gallery-detail"
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
        <h1 class="flex-1 truncate text-sm font-medium">{{ route.meta.title ?? "" }}</h1>
        <Button aria-label="切换主题" size="icon-sm" variant="ghost" @click="appStore.setDark(!appStore.isDark)">
          <SunIcon v-if="appStore.isDark" />
          <MoonIcon v-else />
        </Button>
      </header>
      <div class="flex flex-1 flex-col gap-4 p-4">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <!-- 离开图库保留缓存容器；按路由名各缓存一份列表和详情，换凭据不重建普通页面。 -->
          <KeepAlive :key="authStore.galleryRevision" :max="2">
            <component :is="Component" v-if="isGalleryRoute(viewRoute)" :key="viewRoute.name" />
          </KeepAlive>
          <component :is="Component" v-if="!isGalleryRoute(viewRoute)" />
        </RouterView>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
