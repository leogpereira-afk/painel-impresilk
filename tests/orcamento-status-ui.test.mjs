import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const entrada = `
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server.browser';
  import {MemoryRouter} from 'react-router-dom';
  import Cliente360 from './components/Cliente360.jsx';
  import Orcamentos from './pages/Orcamentos.jsx';
  import {CONFIG_PADRAO} from './config/defaults.js';
  import {definirEstado} from './config/store.jsx';
  const proposta={id:'1',numero:'42',clienteId:'c1',cliente:'Cliente de teste',situacao:'conferir',statusErp:'PENDENTE',valor:10000,margem:1000,dataEnvio:'2026-10-01',vendedorId:'v1'};
  export const ficha=()=>renderToStaticMarkup(React.createElement(Cliente360,{alvo:proposta,dados:{orcamentos:[proposta]},hoje:'2026-10-07'}));
  export function pagina(aba){
    definirEstado({config:CONFIG_PADRAO,dados:{orcamentos:[proposta]},overridesOrcamentos:{},pronto:true,erro:null,frescorDe:()=>null,fontesNegadas:[],fontesQueFalharam:[]});
    return renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:['/orcamentos/mesa?aba='+aba]},React.createElement(Orcamentos)));
  }
`;

let tela;
async function carregar() {
  if (!tela) {
    const saida = await build({
      stdin: { contents: entrada, resolveDir: SRC, loader: "jsx" },
      bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent", jsx: "automatic",
      mainFields: ["module", "main"], conditions: ["browser", "import", "default"],
      loader: { ".css": "empty", ".png": "empty", ".ttf": "empty" },
      define: { "import.meta.env": '{"MODE":"test"}', "process.env.NODE_ENV": '"production"' },
      // Apenas a fronteira de dados é substituída; componentes e cálculo são reais.
      // SSR não executa efeitos, portanto não consulta nem altera o servidor.
      plugins: [{ name: "estado-sintetico", setup(plugin) {
        plugin.onResolve({ filter: /config\/store\.jsx$/ }, () => ({ path: "estado", namespace: "estado-sintetico" }));
        plugin.onLoad({ filter: /.*/, namespace: "estado-sintetico" }, () => ({ contents: "let estado; export const definirEstado = valor => estado = valor; export const useApp = () => estado;", loader: "js" }));
      } }],
    });
    tela = await import("data:text/javascript;base64," + Buffer.from(saida.outputFiles[0].text).toString("base64"));
  }
  return tela;
}

test("Cliente 360 mostra proposta desconhecida a conferir, sem apresentá-la como aberta", async () => {
  const html = (await carregar()).ficha();
  const proposta = html.match(/<button[^>]*class="c360-item c360-proposta"[^>]*>([\s\S]*?)<\/button>/)?.[1];
  assert.ok(proposta, "a proposta desconhecida continua disponível na ficha");
  assert.match(proposta, /A conferir/);
  assert.doesNotMatch(proposta, /Aberta|Ganha|Perdida/);
});

test("Histórico oferece a quantidade a conferir e a mesa explica sua exclusão", async () => {
  const tela = await carregar();
  assert.match(tela.pagina("historico"), /A conferir \(1\)/);
  assert.match(tela.pagina("mesa"), /1 com status do ERP a conferir/);
  assert.match(tela.pagina("mesa"), /fora dos ganhos, perdas e conversão/);
});
