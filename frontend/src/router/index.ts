import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

import AppLayout from "@/layouts/AppLayout"
import HolidayPage from "@/pages/HolidayPage"
import NotFoundPage from "@/pages/NotFoundPage"

const routes: RouteRecordRaw[] = [
    {
        path: "/",
        component: AppLayout,
        children: [
            {
                path: "",
                redirect: "/holiday",
            },
            {
                path: "holiday",
                name: "HolidayPage",
                component: HolidayPage,
            },
            {
                path: ":pathMatch(.*)*",
                name: "NotFoundPage",
                component: NotFoundPage,
            },
        ],
    },
]

export const AppRouter = createRouter({
    history: createWebHashHistory(),
    routes,
})
