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
      default: false,
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
      <div class="h-full">
        <ElMenu
          class="border-r-0 bg-transparent"
          collapse={props.collapsed}
          defaultActive={activePath.value}
          onSelect={handleSelect}
        >
          {navItems.map((item) => (
            <ElMenuItem index={item.path}>
              <ElIcon>
                <item.icon/>
              </ElIcon>
              <ElText>{item.label}</ElText>
            </ElMenuItem>
          ))}
        </ElMenu>
      </div>
    )
  },
})
