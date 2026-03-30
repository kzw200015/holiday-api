import { computed, defineComponent } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Calendar } from "@element-plus/icons-vue"
import { ElIcon, ElMenu, ElMenuItem } from "element-plus"

type NavItem = {
  path: string
  label: string
  icon: typeof Calendar
}

/* 侧栏导航项配置 */
const navItems: NavItem[] = [
  { path: "/holiday", label: "节假日", icon: Calendar },
]

/* 侧栏导航组件 */
export default defineComponent({
  props: {
    collapsed: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["menuSelect"],
  setup(props, { emit }) {
    const route = useRoute()
    const router = useRouter()
    const activePath = computed(() => route.path)

    const handleSelect = async (index: string) => {
      await router.push(index)
      emit("menuSelect")
    }

    return () => (
      <div class="h-full">
        <ElMenu
          class="border-r-0 bg-transparent"
          collapse={props.collapsed}
          defaultActive={activePath.value}
          onSelect={handleSelect}
        >
          {navItems.map((item) => (
            <ElMenuItem key={item.path} index={item.path}>
              <ElIcon>
                <item.icon />
              </ElIcon>
              <span>{item.label}</span>
            </ElMenuItem>
          ))}
        </ElMenu>
      </div>
    )
  },
})
