import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/weight": "http://127.0.0.1:8765",
      "/checkin": "http://127.0.0.1:8765",
      "/daily": "http://127.0.0.1:8765",
      "/meals": "http://127.0.0.1:8765",
      "/workouts": "http://127.0.0.1:8765",
      "/oura": "http://127.0.0.1:8765",
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
