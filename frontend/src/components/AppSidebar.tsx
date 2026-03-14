import { computed, defineComponent, type PropType } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Calendar } from "@element-plus/icons-vue"
import { ElIcon, ElMenu, ElMenuItem } from "element-plus"

type NavItem = {
  path: string
  label: string
  icon: typeof Calendar
}

const navItems: NavItem[] = [
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
      default: false,
    },
    onMenuSelect: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    const activePath = computed(() => route.path)

    const handleSelect = async (index: string) => {
      await router.push(index)
      props.onMenuSelect?.()
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
                <item.icon/>
              </ElIcon>
              <span>{item.label}</span>
            </ElMenuItem>
          ))}
        </ElMenu>
      </div>
    )
  },
})
