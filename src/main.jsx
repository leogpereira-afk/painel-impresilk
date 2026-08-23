import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { AppProvider } from "./config/store.jsx";

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
