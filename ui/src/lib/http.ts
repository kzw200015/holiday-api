import axios from "axios"

/**
 * Axios 实例。
 *
 * - 使用相对路径：由 Vite dev server 代理 /api 到后端
 * - 生产环境：由同源部署/反向代理提供 /api
 */
export const http = axios.create({
    headers: {
        Accept: "application/json",
    },
    baseURL: "/api",
})

