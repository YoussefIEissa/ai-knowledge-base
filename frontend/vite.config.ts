import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// Where the existing FastAPI backend listens. Override with
// KNOWLEDGE_API_URL=http://host:port when starting Vite.
const BACKEND_TARGET = process.env.KNOWLEDGE_API_URL ?? "http://127.0.0.1:8000";

// The backend sends no CORS headers, so the browser talks to the Vite
// server and Vite forwards /api/* to the backend with the prefix removed.
const proxy: Record<string, ProxyOptions> = {
  "/api": {
    target: BACKEND_TARGET,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BACKEND_TARGET__: JSON.stringify(BACKEND_TARGET),
  },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
