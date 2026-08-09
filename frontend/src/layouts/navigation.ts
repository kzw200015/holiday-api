import type { LucideIcon } from "@lucide/vue"

import { CalendarDaysIcon, HouseIcon } from "@lucide/vue"

/* 侧边栏导航项：只声明展示哪些路由及其图标，名称与路径均取自路由表 */
export interface NavigationItem {
  /* 对应路由记录的 name */
  name: string
  icon: LucideIcon
}

/* 数组顺序即侧边栏展示顺序 */
export const navigationItems: NavigationItem[] = [
  { name: "home", icon: HouseIcon },
  { name: "holiday", icon: CalendarDaysIcon },
]
