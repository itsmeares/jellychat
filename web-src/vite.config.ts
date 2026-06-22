import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  resolve: {
    conditions: ["production", "browser"]
  },
  build: {
    outDir: "../Jellyfin.Plugin.JellyChat/Web",
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.tsx"),
      name: "JellyChat",
      formats: ["iife"],
      fileName: () => "jellychat.js",
      cssFileName: "jellychat"
    },
    rollupOptions: {
      output: {
        entryFileNames: "jellychat.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "jellychat.css";
          }

          return "jellychat.[ext]";
        }
      }
    }
  }
});
