import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

/* 路由表：业务页面在此登记 */
const routes: RouteRecordRaw[] = []

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
})
