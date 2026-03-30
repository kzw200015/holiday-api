import { defineComponent } from "vue"
import { RouterView } from "vue-router"
import { ElConfigProvider } from "element-plus"
import zhCn from "element-plus/es/locale/lang/zh-cn"

/* 根组件：Element Plus 中文化 + 路由出口 */
export default defineComponent({
  setup() {
    return () => (
      <ElConfigProvider locale={zhCn}>
        <RouterView />
      </ElConfigProvider>
    )
  },
})
