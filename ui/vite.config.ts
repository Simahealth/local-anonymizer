/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la app de escritorio sirve ui/dist desde el disco
  // (servidor local de pywebview), no desde la raíz de un dominio.
  base: "./",
  // Puerto propio (no el 5173 por defecto) para no chocar con otros proyectos
  // Vite; `python -m escritorio.app --dev` apunta aquí.
  server: { port: 5317, strictPort: true },
  build: {
    // Todo local: las fuentes se empaquetan, nada se pide a internet.
    assetsInlineLimit: 0,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
