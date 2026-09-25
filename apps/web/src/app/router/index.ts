import {
  createRouter,
  createWebHashHistory,
  type RouteLocationNormalizedLoaded,
  type RouteLocationRaw,
  type RouteRecordRaw,
} from "vue-router"

import AppLayout from "@/app/layouts/AppLayout.vue"
import { useAuthStore } from "@/features/auth/store"
import { galleryDetailLocation, galleryIdentity, galleryListLocation, gallerySource } from "@/features/eh/navigation"

declare module "vue-router" {
  interface RouteMeta {
    /* 页面名称，顶栏标题与侧边栏导航共用这一份 */
    title?: string
    /* 需要登录才能进。首页和节假日页保持公开：节假日接口本来就允许匿名访问 */
    requiresAuth?: boolean
    /* 页面被 KeepAlive 保留并用 usePageScroll 自管滚动位置，路由器不再按历史位置滚动 */
    ownScroll?: boolean
    /* 顶栏的返回按钮：叫什么、回哪去。放在顶栏是因为它钉在顶上，页面滚到哪都点得到 */
    back?: { label: string; to: (route: RouteLocationNormalizedLoaded) => RouteLocationRaw }
  }
}

/* 路由表：业务页面作为布局的子路由登记，需要全屏的页面（登录、阅读）与布局平级 */
const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/features/auth/views/LoginView.vue"),
    meta: { title: "登录" },
  },
  {
    path: "/eh/read/:gid(\\d+)/:token/:page(\\d+)?",
    name: "reader",
    component: () => import("@/features/eh/views/ReaderView.vue"),
    props: (route) => ({
      ...galleryIdentity(route),
      page: Number(route.params.page ?? 1),
      source: gallerySource(route.query),
    }),
    meta: { title: "阅读", requiresAuth: true },
  },
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "", name: "home", component: () => import("@/app/views/HomeView.vue"), meta: { title: "首页" } },
      {
        path: "holiday",
        name: "holiday",
        component: () => import("@/features/holiday/views/HolidayView.vue"),
        meta: { title: "节假日查询" },
      },
      {
        path: "eh",
        name: "gallery",
        component: () => import("@/features/eh/EhLayout.vue"),
        meta: { title: "图库", requiresAuth: true },
        children: [
          {
            path: "",
            name: "gallery-list",
            component: () => import("@/features/eh/views/GalleryListView.vue"),
            meta: { title: "图集搜索", ownScroll: true },
          },
          {
            path: "history",
            name: "gallery-history",
            component: () => import("@/features/eh/views/GalleryHistoryView.vue"),
            meta: { title: "阅读历史", ownScroll: true },
          },
          {
            path: "g/:gid(\\d+)/:token",
            name: "gallery-detail",
            component: () => import("@/features/eh/views/GalleryDetailView.vue"),
            props: (route) => ({ ...galleryIdentity(route), source: gallerySource(route.query) }),
            meta: {
              title: "图集详情",
              ownScroll: true,
              back: { label: "返回列表", to: (route) => galleryListLocation(gallerySource(route.query)) },
            },
          },
          {
            path: "g/:gid(\\d+)/:token/comments",
            name: "gallery-comments",
            component: () => import("@/features/eh/views/GalleryCommentsView.vue"),
            props: (route) => galleryIdentity(route),
            meta: {
              title: "全部评论",
              back: {
                label: "返回详情",
                to: (route) => galleryDetailLocation(galleryIdentity(route), gallerySource(route.query)),
              },
            },
          },
        ],
      },
      {
        path: "settings",
        name: "settings",
        component: () => import("@/app/views/SettingsView.vue"),
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
