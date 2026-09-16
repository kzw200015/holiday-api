<script setup lang="ts">
import { ZapIcon } from "@lucide/vue"
import { watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { getNavigationItems } from "@/layouts/navigation"

const route = useRoute()
const items = getNavigationItems(useRouter())
const { setOpenMobile } = useSidebar()
/* 移动端选中目标页面后收起抽屉。 */
watch(
  () => route.fullPath,
  () => setOpenMobile(false),
)

function isActive(name: string) {
  return route.matched.some((record) => record.name === name)
}
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child size="lg">
            <RouterLink to="/">
              <div
                class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
              >
                <ZapIcon class="size-4" />
              </div>
              <span class="truncate font-semibold">MyAPI</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>导航</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in items" :key="item.name">
              <SidebarMenuButton as-child :is-active="isActive(item.name)" :tooltip="item.label">
                <RouterLink :to="{ name: item.name }">
                  <component :is="item.icon" />
                  <span>{{ item.label }}</span>
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
</template>
