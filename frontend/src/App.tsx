import { defineComponent, KeepAlive, provide, type VNode } from "vue"
import { RouterView } from "vue-router"
import { createGalleryNavigation, galleryNavigationKey } from "@/composables/galleryNavigation"
import { useAuthStore } from "@/stores/AuthStore"

/* 根组件：路由出口（主题初始化在 main.ts 挂载前完成，避免首帧闪白） */
export default defineComponent({
  setup() {
    const auth = useAuthStore()
    provide(galleryNavigationKey, createGalleryNavigation())
    /* 阅读器仍全屏且不缓存；它离开布局时，只停用而不销毁布局内的页面。 */
    return () => <RouterView>{({ Component }: { Component: VNode | undefined }) => (
      <KeepAlive include={["AppLayout"]} key={auth.sessionRevision}>
        {Component}
      </KeepAlive>
    )}</RouterView>
  },
})
