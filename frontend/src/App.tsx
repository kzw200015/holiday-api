import { defineComponent, onMounted, onUnmounted } from "vue"
import { RouterView } from "vue-router"

import { useAppStore } from "@/stores/AppStore"

/* 根组件：初始化主题与响应式断点跟踪 + 路由出口 */
export default defineComponent({
  setup() {
    const appStore = useAppStore()

    onMounted(() => {
      appStore.initializeTheme()
      appStore.startResponsiveTracking()
    })

    onUnmounted(() => {
      appStore.stopResponsiveTracking()
    })

    return () => <RouterView />
  },
})
