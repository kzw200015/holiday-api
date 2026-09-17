import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

import AppLayout from "@/layouts/AppLayout.vue"
import { gallerySource, readerOrigin } from "@/lib/galleryNavigation"
import { useAuthStore } from "@/stores/AuthStore"

declare module "vue-router" {
  interface RouteMeta {
    /* 页面名称，顶栏标题与侧边栏导航共用这一份 */
    title?: string
    /* 需要登录才能进。首页和节假日页保持公开：节假日接口本来就允许匿名访问 */
    requiresAuth?: boolean
    /* 页面被 KeepAlive 保留并用 usePageScroll 自管滚动位置，路由器不再按历史位置滚动 */
    ownScroll?: boolean
  }
}

/* 路由表：业务页面作为布局的子路由登记，需要全屏的页面（登录、阅读）与布局平级 */
const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", component: () => import("@/views/LoginView.vue"), meta: { title: "登录" } },
  {
    path: "/eh/read/:gid(\\d+)/:token/:page(\\d+)?",
    name: "reader",
    component: () => import("@/views/ReaderView.vue"),
    props: (route) => ({
      gid: Number(route.params.gid),
      token: String(route.params.token),
      page: Number(route.params.page ?? 1),
      origin: readerOrigin(route.query),
    }),
    meta: { title: "阅读", requiresAuth: true },
  },
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "", name: "home", component: () => import("@/views/HomeView.vue"), meta: { title: "首页" } },
      {
        path: "holiday",
        name: "holiday",
        component: () => import("@/views/HolidayView.vue"),
        meta: { title: "节假日查询" },
      },
      {
        path: "eh",
        name: "gallery",
        component: () => import("@/layouts/EhLayout.vue"),
        meta: { title: "图库", requiresAuth: true },
        children: [
          {
            path: "",
            name: "gallery-list",
            component: () => import("@/views/GalleryListView.vue"),
            meta: { title: "图集搜索", ownScroll: true },
          },
          {
            path: "history",
            name: "gallery-history",
            component: () => import("@/views/GalleryHistoryView.vue"),
            meta: { title: "阅读历史", ownScroll: true },
          },
          {
            path: "g/:gid(\\d+)/:token",
            name: "gallery-detail",
            component: () => import("@/views/GalleryDetailView.vue"),
            props: (route) => ({
              gid: Number(route.params.gid),
              token: String(route.params.token),
              source: gallerySource(route.query),
            }),
            meta: { title: "图集详情", ownScroll: true },
          },
        ],
      },
      {
        path: "settings",
        name: "settings",
        component: () => import("@/views/SettingsView.vue"),
        meta: { title: "设置", requiresAuth: true },
      },
    ],
  },
]

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
  /* 自管滚动的缓存页由组件恢复位置，也涵盖按钮主动返回；其余页面沿用浏览器历史位置。 */
  scrollBehavior: (to, _from, savedPosition) => (to.meta.ownScroll ? false : (savedPosition ?? { top: 0 })),
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
