import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({mode}) => ({
  // No GitHub Pages o site vive em /painel-impresilk/: o workflow do Pages
  // define BASE_PATH. Sem ele (dev local), o site fica na raiz.
  base: process.env.BASE_PATH || "/",
  plugins: [react(), ...(mode === 'review' ? [{
    name: 'review-context-full-reload',
    apply: 'serve',
    enforce: 'pre',
    handleHotUpdate({file, server}) {
      // Os mocks chegam ao Provider por sessão/serviços. Fast Refresh parcial
      // pode misturar consumidores novos com o AppContext da raiz preservada.
      const caminho = file.replaceAll('\\', '/');
      if (!/\/(?:src\/(?:review\/|config\/|services\/|lib\/sessao\.js$)|supabase\/functions\/_shared\/)/.test(caminho)) return;
      server.moduleGraph.invalidateAll();
      server.ws.send({type: 'full-reload'});
      return [];
    },
  }] : [])],
  server: { port: 5173, open: false },
  /* target es2022: os navegadores da casa (Chrome/Safari atuais, o iPhone do
     CEO) entendem tudo disso nativo -- o transpile para sintaxe antiga so
     inflava o bundle com helpers que ninguem precisa. */
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
}));
