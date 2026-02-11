import { defineComponent } from "vue"
import { RouterView } from "vue-router"

export default defineComponent({
    name: "AppRoot",
    setup() {
        return () => <RouterView/>
    },
})
