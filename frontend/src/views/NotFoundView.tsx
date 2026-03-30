import { defineComponent } from "vue"
import { useRouter } from "vue-router"
import { ElButton, ElEmpty } from "element-plus"

/* 404 页面 */
export default defineComponent({
  setup() {
    const router = useRouter()

    return () => (
      <section class="flex justify-center pt-20">
        <ElEmpty description="页面不存在" imageSize={120}>
          <ElButton type="primary" onClick={() => router.push("/holiday")}>
            回到概览
          </ElButton>
        </ElEmpty>
      </section>
    )
  },
})
