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
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2,mp3,wav}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      includeAssets: [
        "favicon.ico",
        "robots.txt",
        "placeholder.svg",
        "farm-background-desktop.jpg",
        "farm-backgroundmobile.jpg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-512-maskable.png",
        "icons/farmvault-192.png",
        "icons/farmvault-512.png",
        "icons/badge.png",
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
