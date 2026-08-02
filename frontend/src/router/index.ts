import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

/* 路由表：业务页面在此登记为 AppLayout 的子路由 */
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("@/layouts/AppLayout"),
    children: [],
  },
]

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
})
