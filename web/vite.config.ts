import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Point to a running API. Default: local dev API on the Mac.
// To develop against the Pi's data, run: VITE_API=http://hallway-server.local:8765 npm run dev
const proxyTarget = process.env.VITE_API ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      [
        "/weight",
        "/checkin",
        "/daily",
        "/meals",
        "/workouts",
        "/oura",
        "/garmin",
        "/tuya",
        "/push",
        "/data",
        "/health",
      ].map((p) => [p, proxyTarget]),
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
