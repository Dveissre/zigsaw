import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        test: resolve(process.cwd(), "test/index.html"),
        testRedirect: resolve(process.cwd(), "test.html"),
        atlas: resolve(process.cwd(), "atlas/index.html"),
        gacha: resolve(process.cwd(), "gacha/index.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});

