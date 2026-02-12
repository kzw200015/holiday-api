import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"

import AppLayout from "@/layouts/AppLayout"
import HolidayPage from "@/views/HolidayPage"
import CodexAccountsPage from "@/views/CodexAccountsPage"
import NotFoundPage from "@/views/NotFoundPage"

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
                path: "codex",
                name: "CodexAccountsPage",
                component: CodexAccountsPage,
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
    history: createWebHistory(),
    routes,
})
