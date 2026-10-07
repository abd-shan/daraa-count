import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    /*
     * Keeps media queries as `min-width` / `max-width` instead of the modern
     * range syntax (`width >= 721px`) the default target rewrites them to.
     * Range syntax needs Chrome 104+, Firefox 102+ or Safari 16.4+, and a
     * browser that does not understand it drops the whole block — which would
     * silently cost the sidebar and the bottom bar on an older committee
     * computer. The stylesheet's own features (dvh, :has, logical properties)
     * set the real floor; this only avoids giving up support for free.
     */
    cssTarget: "chrome99",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: false } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    restoreMocks: true,
    // Pin the API prefix so a developer's local .env cannot change assertions.
    env: { VITE_API_URL: "/api" },
  },
});
