import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { prototypeHistoryFallback } from "./prototype-routing";

/** Build only the disposable architecture slice so its output is measurable. */
export default defineConfig({
  plugins: [prototypeHistoryFallback(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist-prototype",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "prototype/index.html"),
    },
  },
});
