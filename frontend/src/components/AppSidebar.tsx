import { computed, defineComponent } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Calendar, Key } from "@element-plus/icons-vue"
import { ElIcon, ElMenu, ElMenuItem, ElText } from "element-plus"

const navItems = [
    {
        path: "/holiday",
        label: "节假日",
        icon: Calendar,
    },
    {
        path: "/codex",
        label: "Codex 账户",
        icon: Key,
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
            <aside class="flex h-full flex-col">
                <div class="flex h-16 cursor-pointer items-center px-3" onClick={() => void router.push("/holiday")}>
                    <div
                        class="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--el-color-primary)] text-xs font-semibold text-white">
                        API
                    </div>
                    <div
                        class={`grid min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin-left] duration-200 ${
                            props.collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-32 opacity-100"
                        }`}
                    >
                        <ElText class="font-semibold" tag="div">
                            控制台
                        </ElText>
                        <ElText class="text-xs text-[var(--el-text-color-secondary)]" tag="div">
                            Java API
                        </ElText>
                    </div>
                </div>

                <ElMenu
                    class="border-r-0 bg-transparent"
                    defaultActive={activePath.value}
                    collapse={props.collapsed}
                    onSelect={handleSelect}
                >
                    {navItems.map((item) => (
                        <ElMenuItem index={item.path}>
                            <ElIcon>
                                <item.icon/>
                            </ElIcon>
                            <span>{item.label}</span>
                        </ElMenuItem>
                    ))}
                </ElMenu>
            </aside>
        )
    },
})
