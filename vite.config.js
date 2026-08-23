import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Netlify publica a pasta dist; as Functions ficam em netlify/functions.
export default defineConfig({
  // No GitHub Pages o site vive em /painel-impresilk/; no Netlify, na raiz.
  // O workflow do Pages define BASE_PATH; sem ele, nada muda.
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  server: { port: 5173, open: false },
  /* target es2022: os navegadores da casa (Chrome/Safari atuais, o iPhone do
     CEO) entendem tudo disso nativo -- o transpile para sintaxe antiga so
     inflava o bundle com helpers que ninguem precisa. */
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
});
