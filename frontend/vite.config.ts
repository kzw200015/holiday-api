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
      /* 身份走 Authorization 头，后端不看 Origin，所以这里不需要改写来源 */
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
})
