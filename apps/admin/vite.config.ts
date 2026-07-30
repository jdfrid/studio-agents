import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.ADMIN_PORT ?? 5174),
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT ?? 4000}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, "")
      }
    }
  },
  build: { outDir: "dist" }
});
