// vite.config.ts
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

    // ✅ Option 1: allow all hosts in dev (easiest for Replit)
   

    // ✅ Option 2: OR specify your current Replit URL explicitly
    // allowedHosts: ["9c05e64d-1c4d-440d-b4b2-b038fdd58e0b-00-2liewx1oqvb8k.riker.replit.dev"],

    // (Optional) HMR behind HTTPS proxy like Replit
    // hmr: { clientPort: 443 },

    proxy: {
      "/api": { target: "http://localhost:5001", changeOrigin: true },
      "/uploads": { target: "http://localhost:5001", changeOrigin: true },
    },
    allowedHosts: [
      "9c05e64d-1c4d-440d-b4b2-b038fdd58e0b-00-2liewx1oqvb8k.riker.replit.dev"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
