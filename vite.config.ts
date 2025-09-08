
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [react(), runtimeErrorOverlay()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
      port: 5177,
      strictPort: true,
      allowedHosts: ["*.replit.dev", "*.riker.replit.dev"],
      proxy: {
        "/api": { target: "http://localhost:5000", changeOrigin: true },
        "/uploads": { target: "http://localhost:5000", changeOrigin: true },
      },
    
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
