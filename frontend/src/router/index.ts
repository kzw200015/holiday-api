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
        redirect: "/codex/accounts",
      },
      {
        path: "codex/accounts",
        name: "CodexAccountsPage",
        component: () => import("@/views/codex/CodexAccountsPage"),
      },
      {
        path: "codex/response-logs",
        name: "CodexResponseLogsPage",
        component: () => import("@/views/codex/CodexResponseLogsPage"),
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
