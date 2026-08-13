import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export const prototypeRoot = path.resolve(__dirname, "prototype");

/** Build only the disposable architecture slice so its output is measurable. */
export const prototypeViteConfig = defineConfig({
  root: prototypeRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    fs: {
      allow: [__dirname],
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-prototype"),
    emptyOutDir: true,
  },
});

export default prototypeViteConfig;
