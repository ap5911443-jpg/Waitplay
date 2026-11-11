import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5200,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:3150",
        ws: true,
        changeOrigin: true,
      },
      "/events": {
        target: "http://127.0.0.1:3150",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3150",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://127.0.0.1:3150",
        changeOrigin: true,
      },
      "/sessions": {
        target: "http://127.0.0.1:3150",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@waitplay/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
});
