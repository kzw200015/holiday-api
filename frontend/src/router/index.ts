import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("@/layouts/AppLayout.vue"),
    children: [
      {
        path: "",
        redirect: "/holiday",
      },
      {
        path: "holiday",
        name: "HolidayView",
        component: () => import("@/views/HolidayView.vue"),
      },
      {
        path: ":pathMatch(.*)*",
        name: "NotFoundView",
        component: () => import("@/views/NotFoundView.vue"),
      },
    ],
  },
]

export const AppRouter = createRouter({
  history: createWebHashHistory(),
  routes,
})
