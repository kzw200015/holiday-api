import { ZapIcon } from "@lucide/vue"
import { defineComponent, watch } from "vue"
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

/* 侧边栏内容：桌面端收窄为图标栏，移动端由 Sidebar 自动切换为抽屉 */
export default defineComponent({
  name: "AppSidebar",
  setup() {
    const router = useRouter()
    const route = useRoute()

    const items = getNavigationItems(router)
    const { setOpenMobile } = useSidebar()
    /* 移动端选中目标页面后收起抽屉，让内容可见。 */
    watch(
      () => route.fullPath,
      () => setOpenMobile(false),
    )

    /* 选中态交给 router 的匹配结果，子路由与动态段都能正确命中 */
    function isActive(name: string) {
      return route.matched.some((record) => record.name === name)
    }

    return () => (
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg">
                <RouterLink to="/">
                  <div class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
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
                {items.map((item) => (
                  <SidebarMenuItem key={item.name}>
                    {/* tooltip 仅在图标栏状态下展示 */}
                    <SidebarMenuButton asChild isActive={isActive(item.name)} tooltip={item.label}>
                      <RouterLink to={{ name: item.name }}>
                        <item.icon />
                        <span>{item.label}</span>
                      </RouterLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* 侧边栏右缘的拖拽把手，点击可折叠 */}
        <SidebarRail />
      </Sidebar>
    )
  },
})
