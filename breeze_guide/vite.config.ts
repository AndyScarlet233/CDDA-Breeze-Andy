import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { VitePWA } from "vite-plugin-pwa";
import EnvironmentPlugin from "vite-plugin-environment";

const base = process.env.BREEZE_GUIDE_BASE || "/";

export default defineConfig({
  base,
  build: {
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
  plugins: [
    EnvironmentPlugin({
      GITHUB_SHA: null,
      SENTRY_DSN: null,
    }),
    svelte(),
    svelteTesting(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: ["favicon.png"],
      manifest: {
        short_name: "微风指南",
        name: "CDDA-Breeze 微风指南",
        description:
          "查询 CDDA-Breeze 本体与维护者审核模组中的物品、怪物、家具等游戏数据。",
        icons: [
          {
            src: "icon-192.png",
            type: "image/png",
            sizes: "192x192",
          },
          {
            src: "icon-512.png",
            type: "image/png",
            sizes: "512x512",
          },
        ],
        start_url: "./",
        theme_color: "#202020",
        background_color: "#1c1c1c",
        display: "standalone",
      },
      workbox: {
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/data\/(本体|模组)\/.*\.json(\?.*)?$/,
            handler: "CacheFirst",
            options: {
              cacheName: "微风指南数据包",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
            },
          },
          {
            urlPattern: /\/data\/(模组索引|构建信息|zh_CN)\.json(\?.*)?$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "微风指南索引",
              networkTimeoutSeconds: 10,
            },
          },
        ],
        skipWaiting: true,
      },
    }),
  ],
});
