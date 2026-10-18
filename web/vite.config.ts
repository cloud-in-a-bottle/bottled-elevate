/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  // Relative asset URLs so the build works under any mount path (eg the workbench proxy).
  base: "./",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8080", "/health": "http://localhost:8080" }
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 4000 },
  // Tests cover pure algorithms; no DOM needed.
  test: { environment: "node" }
});
