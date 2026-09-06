import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    tailwindcss(),
    VitePWA({
      // 新版本在关闭旧页面后接管，避免阅读途中强制刷新。
      injectRegister: "script-defer",
      manifest: {
        name: "MyAPI",
        short_name: "MyAPI",
        description: "图库阅读与节假日查询",
        lang: "zh-CN",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2}"],
        // 哈希路由只需兜底入口；API 与不存在的静态路径保持后端原有响应。
        navigateFallbackAllowlist: [/^\/(?:index\.html)?$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
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
