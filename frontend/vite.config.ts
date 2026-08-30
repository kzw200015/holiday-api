import path from "node:path"
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [vue(), vueJsx(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        /*
         * 后端的 CSRF 中间件按 Origin 判同源，而 changeOrigin 只改 Host、不动 Origin，
         * 浏览器带过来的仍是 dev server 的地址。这里显式改写成后端自己的来源，
         * 省得把 vite 的端口加进后端白名单（端口被占用时 vite 还会自动换成 5174、5175…）
         */
        headers: { origin: "http://localhost:8000" },
      },
    },
  },
})
