import { computed, defineComponent } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Calendar } from "@element-plus/icons-vue"
import { ElIcon, ElMenu, ElMenuItem, ElText } from "element-plus"

const navItems = [
    {
        path: "/holiday",
        label: "节假日",
        icon: Calendar,
    },
]

export default defineComponent({
    name: "AppSidebar",
    props: {
        collapsed: {
            type: Boolean,
            required: true,
        },
    },
    setup(props) {
        const route = useRoute()
        const router = useRouter()
        const activePath = computed(() => route.path)

        const handleSelect = async (index: string) => {
            await router.push(index)
        }

        return () => (
            <aside class="app-sidebar">
                <div class="app-sidebar__brand" onClick={() => void router.push("/holiday")}>
                    <div class="app-sidebar__logo">API</div>
                    {!props.collapsed && (
                        <div class="app-sidebar__brand-text">
                            <ElText class="app-sidebar__title" tag="div">
                                控制台
                            </ElText>
                            <ElText class="app-sidebar__subtitle" tag="div">
                                Java API
                            </ElText>
                        </div>
                    )}
                </div>

                <ElMenu
                    class="app-sidebar__menu"
                    defaultActive={activePath.value}
                    collapse={props.collapsed}
                    onSelect={handleSelect}
                >
                    {navItems.map((item) => (
                        <ElMenuItem index={item.path}>
                            <ElIcon>
                                <item.icon />
                            </ElIcon>
                            <span>{item.label}</span>
                        </ElMenuItem>
                    ))}
                </ElMenu>
            </aside>
        )
    },
})
