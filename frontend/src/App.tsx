import { defineComponent } from "vue"
import { RouterView } from "vue-router"

/* 根组件：路由出口（主题初始化在 main.ts 挂载前完成，避免首帧闪白） */
export default defineComponent({
  setup() {
    return () => <RouterView />
  },
})
