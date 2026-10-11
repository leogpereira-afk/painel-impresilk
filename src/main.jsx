import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { AppProvider } from "./config/store.jsx";
import { marcarFalhaDeCarga } from "./lib/recarga-de-versao.js";

/* ARQUIVO DE TELA QUE NÃO VEIO. O Vite avisa por este evento quando um
   import() de tela falha (o arquivo antigo sumiu depois de uma publicação
   nova). Aqui o erro só é MARCADO como falha de carga; quem decide recarregar
   é a GuardaDeRota, quando a tela que a pessoa abriu precisa dele.
   Recarregar direto daqui seria pior: o prefetch das outras telas
   (App.jsx, prefetchRotas) dispara o mesmo evento em segundo plano, e uma
   falha dele no 4G recarregaria a página no meio de um formulário. */
window.addEventListener("vite:preloadError", (e) => marcarFalhaDeCarga(e.payload));

/* O service worker (public/sw.js) anula o max-age de 10min do GitHub Pages
   para os arquivos com hash: revisita abre do disco, mesmo no 4G ruim. As
   regras estão escritas nele; o registro fica DEPOIS do load para nunca
   competir com o caminho crítico da primeira pintura. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {}); // sem SW o painel funciona exatamente como antes
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);
