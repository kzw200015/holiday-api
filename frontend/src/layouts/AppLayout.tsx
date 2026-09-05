import { MoonIcon, SunIcon } from "@lucide/vue"
import { computed, defineComponent, KeepAlive, type VNode } from "vue"
import { RouterView, useRoute } from "vue-router"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import AppSidebar from "@/layouts/AppSidebar"
import { useAppStore } from "@/stores/AppStore"
import { useAuthStore } from "@/stores/AuthStore"

/* 列表与详情各保留一份；换账号或换凭据时由 galleryRevision 整体重建 */
const CACHED_VIEWS = ["GalleryListView", "GalleryDetailView"]

/* 应用外壳：侧边栏 + 主内容区，折叠与移动端抽屉由 SidebarProvider 托管 */
export default defineComponent({
  name: "AppLayout",
  setup() {
    const appStore = useAppStore()
    const auth = useAuthStore()
    const route = useRoute()

    /* 标题取自路由 meta，未登记进侧边栏的页面同样有标题 */
    const currentLabel = computed(() => route.meta.title ?? "")

    return () => (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header class="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger class="-ml-1" />
            {/* self-center 用于挤掉组件自带的 self-stretch，否则短分隔线会贴到顶栏顶部 */}
            <Separator
              class="mr-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              orientation="vertical"
            />
            <h1 class="flex-1 truncate text-sm font-medium">{currentLabel.value}</h1>
            {/* Button 未声明 emits，原生事件经展开透传给根元素 */}
            <Button
              aria-label="切换主题"
              size="icon-sm"
              variant="ghost"
              {...{ onClick: () => appStore.setDark(!appStore.isDark) }}
            >
              {appStore.isDark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </header>

          <div class="flex flex-1 flex-col gap-4 p-4">
            <RouterView>{({ Component }: { Component: VNode | undefined }) => (
              <KeepAlive include={CACHED_VIEWS} max={2} key={auth.galleryRevision}>
                {Component}
              </KeepAlive>
            )}</RouterView>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  },
})
