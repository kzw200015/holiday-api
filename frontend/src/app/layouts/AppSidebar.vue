<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import { ref, watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"

import { getNavigationItems } from "@/app/navigation"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

const route = useRoute()
const items = getNavigationItems(useRouter())
const { setOpenMobile, state, isMobile } = useSidebar()
const expanded = ref<Record<string, boolean>>({})
const openGroup = ref<string | null>(null)
/* 移动端选中目标页面后收起抽屉。 */
watch(
  () => route.fullPath,
  () => {
    closeNavigation()
    for (const item of items) {
      if (item.children && isActive(item.name)) {
        expanded.value[item.name] = true
      }
    }
  },
  { immediate: true },
)

function closeNavigation() {
  setOpenMobile(false)
  openGroup.value = null
}

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
            <RouterLink to="/" @click="closeNavigation">
              <!-- 与浏览器标签页、PWA 用同一份图标；旁边已有站名，图片本身不再重复朗读 -->
              <img src="/favicon.svg" alt="" class="size-8 shrink-0" />
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
              <template v-if="item.children">
                <Popover
                  v-if="state === 'collapsed' && !isMobile"
                  :open="openGroup === item.name"
                  @update:open="openGroup = $event ? item.name : null"
                >
                  <PopoverTrigger as-child>
                    <SidebarMenuButton :is-active="isActive(item.name)" :tooltip="item.label" :aria-label="item.label">
                      <component :is="item.icon" />
                      <span>{{ item.label }}</span>
                    </SidebarMenuButton>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" class="w-44 p-2">
                    <nav :aria-label="item.label" class="flex flex-col gap-1">
                      <RouterLink
                        v-for="child in item.children"
                        :key="child.name"
                        :to="{ name: child.name }"
                        class="hover:bg-accent rounded-md px-3 py-2 text-sm"
                        :class="{ 'bg-accent': isActive(child.name) }"
                        :aria-current="isActive(child.name) ? 'page' : undefined"
                        @click="closeNavigation"
                      >
                        {{ child.label }}
                      </RouterLink>
                    </nav>
                  </PopoverContent>
                </Popover>
                <template v-else>
                  <SidebarMenuButton
                    :is-active="isActive(item.name)"
                    :aria-expanded="!!expanded[item.name]"
                    :aria-controls="`navigation-${item.name}`"
                    @click="expanded[item.name] = !expanded[item.name]"
                  >
                    <component :is="item.icon" />
                    <span>{{ item.label }}</span>
                    <ChevronDownIcon
                      class="ml-auto transition-transform"
                      :class="{ '-rotate-90': !expanded[item.name] }"
                    />
                  </SidebarMenuButton>
                  <SidebarMenuSub v-show="expanded[item.name]" :id="`navigation-${item.name}`">
                    <SidebarMenuSubItem v-for="child in item.children" :key="child.name">
                      <SidebarMenuSubButton as-child :is-active="isActive(child.name)">
                        <RouterLink :to="{ name: child.name }" @click="closeNavigation">{{ child.label }}</RouterLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </template>
              </template>
              <SidebarMenuButton v-else as-child :is-active="isActive(item.name)" :tooltip="item.label">
                <RouterLink :to="{ name: item.name }" @click="closeNavigation">
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
