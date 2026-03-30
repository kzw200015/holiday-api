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
        name: "HolidayView",
        component: () => import("@/views/HolidayView"),
      },
      {
        path: ":pathMatch(.*)*",
        name: "NotFoundView",
        component: () => import("@/views/NotFoundView"),
      },
    ],
  },
]

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
})
