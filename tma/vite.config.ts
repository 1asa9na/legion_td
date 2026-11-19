import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/health": "http://127.0.0.1:2567",
      "/matchmake": {
        target: "http://127.0.0.1:2567",
        ws: true,
      },
    },
  },
});
