<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import { ref, watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"

import { getNavigationItems } from "@/app/navigation"
import { Button } from "@/components/ui/button"
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

/*
 * 手机抽屉里的导航项放大到行高 44px、16px 字、20px 图标：shadcn 默认的 32px 是按鼠标设计的，手指点偏小。
 * 桌面保持官方尺寸。max-md 与 shadcn 判定手机的断点一致（768px），抽屉里也不会出现收起成图标栏的状态。
 * 子菜单的字号挂在 data-[size=md] 上，要按同样的写法才盖得过去。
 */
const MENU_BUTTON_CLASS = "max-md:h-11 max-md:text-base max-md:[&_svg]:size-5"
const MENU_SUB_BUTTON_CLASS = "max-md:h-10 max-md:data-[size=md]:text-base"

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
          <!-- 菜单项默认紧贴，悬停与选中又同色，相邻两项会连成一块；留出与子菜单相同的间距。 -->
          <SidebarMenu class="gap-1">
            <SidebarMenuItem v-for="item in items" :key="item.name">
              <template v-if="item.children">
                <Popover
                  v-if="state === 'collapsed' && !isMobile"
                  :open="openGroup === item.name"
                  @update:open="openGroup = $event ? item.name : null"
                >
                  <PopoverTrigger as-child>
                    <SidebarMenuButton
                      :class="MENU_BUTTON_CLASS"
                      :is-active="isActive(item.name)"
                      :tooltip="item.label"
                      :aria-label="item.label"
                    >
                      <component :is="item.icon" />
                      <span>{{ item.label }}</span>
                    </SidebarMenuButton>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" class="w-44">
                    <nav :aria-label="item.label" class="flex flex-col gap-1">
                      <Button
                        v-for="child in item.children"
                        :key="child.name"
                        as-child
                        :variant="isActive(child.name) ? 'secondary' : 'ghost'"
                        class="justify-start"
                      >
                        <RouterLink
                          :to="{ name: child.name }"
                          :aria-current="isActive(child.name) ? 'page' : undefined"
                          @click="closeNavigation"
                        >
                          {{ child.label }}
                        </RouterLink>
                      </Button>
                    </nav>
                  </PopoverContent>
                </Popover>
                <template v-else>
                  <SidebarMenuButton
                    :class="MENU_BUTTON_CLASS"
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
                      <SidebarMenuSubButton as-child :class="MENU_SUB_BUTTON_CLASS" :is-active="isActive(child.name)">
                        <RouterLink :to="{ name: child.name }" @click="closeNavigation">{{ child.label }}</RouterLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </template>
              </template>
              <SidebarMenuButton
                v-else
                as-child
                :class="MENU_BUTTON_CLASS"
                :is-active="isActive(item.name)"
                :tooltip="item.label"
              >
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
