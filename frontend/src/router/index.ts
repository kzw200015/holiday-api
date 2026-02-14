import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("@/layouts/AppLayout"),
    children: [
      {
        path: "",
        redirect: "/holiday",
      },
      {
        path: "holiday",
        name: "HolidayPage",
        component: () => import("@/views/HolidayPage"),
      },
      {
        path: "codex",
        name: "CodexAccountsPage",
        component: () => import("@/views/CodexAccountsPage"),
      },
      {
        path: ":pathMatch(.*)*",
        name: "NotFoundPage",
        component: () => import("@/views/NotFoundPage"),
      },
    ],
  },
]

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
})
