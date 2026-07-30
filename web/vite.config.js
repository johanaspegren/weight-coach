import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: process.env.WC_WEB_HOST || "127.0.0.1",
    port: Number(process.env.WC_WEB_PORT || 5173),
    strictPort: true,
    proxy: {
      "/weight": "http://127.0.0.1:8765",
      "/checkin": "http://127.0.0.1:8765",
      "/daily": "http://127.0.0.1:8765",
      "/meals": "http://127.0.0.1:8765",
      "/workouts": "http://127.0.0.1:8765",
      "/data": "http://127.0.0.1:8765",
      "/oura": "http://127.0.0.1:8765",
      "/garmin": "http://127.0.0.1:8765",
      "/tuya": "http://127.0.0.1:8765",
      "/push": "http://127.0.0.1:8765",
      "/health": "http://127.0.0.1:8765",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
