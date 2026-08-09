import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

import AppLayout from "@/layouts/AppLayout"
import HolidayView from "@/views/HolidayView"
import HomeView from "@/views/HomeView"

declare module "vue-router" {
  interface RouteMeta {
    /* 页面名称，顶栏标题与侧边栏导航共用这一份 */
    title?: string
  }
}

/* 路由表：业务页面作为布局的子路由登记 */
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "", name: "home", component: HomeView, meta: { title: "首页" } },
      { path: "holiday", name: "holiday", component: HolidayView, meta: { title: "节假日查询" } },
    ],
  },
]

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
})
