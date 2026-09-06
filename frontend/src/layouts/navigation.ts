import { CalendarDaysIcon, HouseIcon, LibraryIcon, SettingsIcon, type LucideIcon } from "@lucide/vue"
import type { Router } from "vue-router"

/* 侧边栏导航项：只声明展示哪些路由及其图标，名称与路径均取自路由表 */
interface NavigationItem {
  /* 对应路由记录的 name */
  name: string
  icon: LucideIcon
  description: string
}

/* 数组顺序即侧边栏展示顺序 */
const navigationItems: NavigationItem[] = [
  { name: "home", icon: HouseIcon, description: "常用功能入口。" },
  { name: "gallery-list", icon: LibraryIcon, description: "按标题、标签和分类搜索图集，继续上次阅读。" },
  { name: "holiday", icon: CalendarDaysIcon, description: "查询节假日、周末及调休安排，无需登录。" },
  { name: "settings", icon: SettingsIcon, description: "管理本站账号与 e 站账号绑定。" },
]

export function getNavigationItems(router: Router) {
  return navigationItems.map((item) => ({
    ...item,
    label: router.resolve({ name: item.name }).meta.title,
  }))
}
