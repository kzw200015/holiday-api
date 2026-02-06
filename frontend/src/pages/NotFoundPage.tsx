import { defineComponent } from "vue"
import { useRouter } from "vue-router"
import { ElButton, ElEmpty } from "element-plus"

export default defineComponent({
    name: "NotFoundPage",
    setup() {
        const router = useRouter()

        return () => (
            <section class="flex justify-center pt-20">
                <ElEmpty description="页面不存在" image-size={120}>
                    <ElButton type="primary" onClick={() => void router.push("/holiday")}>
                        回到概览
                    </ElButton>
                </ElEmpty>
            </section>
        )
    },
})
