import { defineComponent } from "vue"
import { RouterView } from "vue-router"
import { ElConfigProvider } from "element-plus"
import zhCn from "element-plus/es/locale/lang/zh-cn"

export default defineComponent({
  name: "AppRoot",
  setup() {
    return () => (
      // Element Plus 组件默认中文（日期、分页、空状态等内置文案）。
      <ElConfigProvider locale={zhCn}>
        <RouterView/>
      </ElConfigProvider>
    )
  },
})
