import { computed, defineComponent, type PropType } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Calendar, Key } from "@element-plus/icons-vue"
import { ElIcon, ElMenu, ElMenuItem, ElSubMenu } from "element-plus"

type NavChildItem = {
  path: string
  label: string
}

type NavItem = {
  path: string
  label: string
  icon: typeof Calendar
  children?: NavChildItem[]
}

const navItems: NavItem[] = [
  {
    path: "/holiday",
    label: "节假日",
    icon: Calendar,
  },
  {
    path: "/codex",
    label: "Codex 账户",
    icon: Key,
    children: [
      {
        path: "/codex/accounts",
        label: "账户管理",
      },
      {
        path: "/codex/response-logs",
        label: "调用日志",
      },
    ],
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
    const openedPaths = computed(() => navItems
      .filter((item) => item.children && route.path.startsWith(item.path))
      .map((item) => item.path))

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
          defaultOpeneds={openedPaths.value}
          onSelect={handleSelect}
        >
          {navItems.map((item) => {
            const children = item.children
            if (!children) {
              return (
                <ElMenuItem key={item.path} index={item.path}>
                  <ElIcon>
                    <item.icon/>
                  </ElIcon>
                  <span>{item.label}</span>
                </ElMenuItem>
              )
            }

            return (
              <ElSubMenu key={item.path} index={item.path}>
                {{
                  title: () => (
                    <>
                      <ElIcon>
                        <item.icon/>
                      </ElIcon>
                      <span>{item.label}</span>
                    </>
                  ),
                  default: () => children.map((child) => (
                    <ElMenuItem key={child.path} index={child.path}>
                      <span class="inline-block w-[14px] shrink-0" aria-hidden="true"/>
                      <span>{child.label}</span>
                    </ElMenuItem>
                  )),
                }}
              </ElSubMenu>
            )
          })}
        </ElMenu>
      </div>
    )
  },
})
