import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080, // Fixed port for local dev; avoids Clerk origin mismatch (localhost:8080).
    hmr: { overlay: false },
  },

  build: {
    minify: "esbuild",
    cssMinify: true,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    chunkSizeWarningLimit: 600,
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "robots.txt",
        "placeholder.svg",
        "farm-background-desktop.jpg",
        "farm-backgroundmobile.jpg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-512-maskable.png",
      ],
      manifest: {
        name: "FarmVault",
        short_name: "FarmVault",
        description: "FarmVault smart farm management app",
        theme_color: "#0b1d14",
        background_color: "#0b1d14",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: [/^\/.*/],
        navigateFallbackDenylist: [/^\/api\//, /^\/__/],
        runtimeCaching: [
          // Clerk (and other third-party) scripts must not use CacheFirst — cross-origin
          // dynamic chunks fail opaque/CORS handling and throw workbox "no-response" / ChunkLoadError.
          {
            urlPattern: ({ url }) =>
              url.hostname === "clerk.app.farmvault.africa" ||
              url.hostname.endsWith(".clerk.accounts.dev") ||
              url.hostname === "clerk.com" ||
              url.hostname.endsWith(".clerk.com"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ request, url }) => {
              const origin = (globalThis as unknown as { location?: { origin: string } }).location
                ?.origin;
              return (
                !!origin &&
                url.origin === origin &&
                ["script", "style", "image", "font", "worker"].includes(request.destination)
              );
            },
            handler: "CacheFirst",
            options: {
              cacheName: "app-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: "module",
        navigateFallback: "/index.html",
      },
    }),
  ].filter(Boolean),

  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
