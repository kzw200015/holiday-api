import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

import AppLayout from "@/layouts/AppLayout"
import { useAuthStore } from "@/stores/AuthStore"
import GalleryDetailView from "@/views/GalleryDetailView"
import GalleryListView from "@/views/GalleryListView"
import HolidayView from "@/views/HolidayView"
import HomeView from "@/views/HomeView"
import LoginView from "@/views/LoginView"
import ReaderView from "@/views/ReaderView"
import SettingsView from "@/views/SettingsView"

declare module "vue-router" {
  interface RouteMeta {
    /* 页面名称，顶栏标题与侧边栏导航共用这一份 */
    title?: string
    /* 需要登录才能进。首页和节假日页保持公开：节假日接口本来就允许匿名访问 */
    requiresAuth?: boolean
  }
}

/* 路由表：业务页面作为布局的子路由登记，需要全屏的页面（登录、阅读）与布局平级 */
const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", component: LoginView, meta: { title: "登录" } },
  {
    path: "/eh/read/:gid(\\d+)/:token/:page(\\d+)?",
    name: "reader",
    component: ReaderView,
    meta: { title: "阅读", requiresAuth: true },
  },
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "", name: "home", component: HomeView, meta: { title: "首页" } },
      { path: "holiday", name: "holiday", component: HolidayView, meta: { title: "节假日查询" } },
      { path: "eh", name: "gallery-list", component: GalleryListView, meta: { title: "图库", requiresAuth: true } },
      {
        path: "eh/g/:gid(\\d+)/:token",
        name: "gallery-detail",
        component: GalleryDetailView,
        meta: { title: "图集详情", requiresAuth: true },
      },
      { path: "settings", name: "settings", component: SettingsView, meta: { title: "设置", requiresAuth: true } },
    ],
  },
]

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
  /* 返回列表页时回到原来的位置，配合 GalleryListStore 留住的条目就能接着往下翻 */
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
})

AppRouter.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) {
    return true
  }

  const authStore = useAuthStore()
  /* 首次进入时还不知道自己是谁，先问一次后端 */
  if (!authStore.ready) {
    await authStore.refresh()
  }
  return authStore.user ? true : { name: "login", query: { redirect: to.fullPath } }
})
