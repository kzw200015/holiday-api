<script setup lang="ts">
import { ArrowLeftIcon } from "@lucide/vue"
import { RouterView, useRoute } from "vue-router"

import AppSidebar from "@/app/layouts/AppSidebar.vue"
import UpdatePrompt from "@/app/layouts/UpdatePrompt.vue"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useAuthStore } from "@/features/auth/store"
import { useGoBack } from "@/shared/composables/useGoBack"

const authStore = useAuthStore()
const route = useRoute()
const returnTo = useGoBack()

function goBack() {
  if (route.meta.back) {
    returnTo(route.meta.back.to(route))
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
      </header>
      <div class="flex flex-1 flex-col gap-4 p-4">
        <UpdatePrompt />
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
