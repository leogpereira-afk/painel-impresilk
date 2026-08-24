// Sem sessao, o painel inteiro e a tela de login -- nem o Layout monta. Assim
// nenhuma rota "vaza" por digitar o endereco direto.
//
// A protecao por MODULO tem duas camadas: aqui (a rota recusa) e no servidor
// (a function recusa). A daqui e conforto; a que vale e a de la, porque o
// navegador esta sempre sob controle de quem usa.

import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Lock } from "lucide-react";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";

/* CADA TELA VIRA UM ARQUIVO, e so desce quando alguem abre.
   Ate 18/08/2026 as 17 paginas entravam no MESMO arquivo: 313 kB comprimidos
   para quem so queria ver contas atrasadas -- vinham junto orcamentos, fluxo,
   gestao, patrimonio e a propria tela de Acessos. Numa rede de obra isso e a
   diferenca entre abrir e desistir.
   Login e Home ficam estaticos de proposito: sao a primeira coisa que todo
   mundo ve, e adiar o que ja vai ser pedido so acrescenta uma ida a rede. */
const ContasAtrasadas = lazy(() => import("./pages/ContasAtrasadas.jsx"));
const Orcamentos = lazy(() => import("./pages/Orcamentos.jsx"));
const Configuracoes = lazy(() => import("./pages/Configuracoes.jsx"));
const Acessos = lazy(() => import("./pages/Acessos.jsx"));
const Ativos = lazy(() => import("./pages/Ativos.jsx"));
const Bancos = lazy(() => import("./pages/Bancos.jsx"));
const Marketing = lazy(() => import("./pages/Marketing.jsx"));
const Licitacoes = lazy(() => import("./pages/Licitacoes.jsx"));
const Glossario = lazy(() => import("./pages/Glossario.jsx"));
const Compromissos = lazy(() => import("./pages/Compromissos.jsx"));
const Gestao = lazy(() => import("./pages/Gestao.jsx"));
const Manutencoes = lazy(() => import("./pages/Manutencoes.jsx"));
const Permutas = lazy(() => import("./pages/Permutas.jsx"));
const Campanhas = lazy(() => import("./pages/Campanhas.jsx"));
const Patrimonio = lazy(() => import("./pages/Patrimonio.jsx"));

/* PREFETCH EM OCIOSIDADE: depois que a tela atual assentou, os chunks das
   OUTRAS rotas descem em segundo plano -- e o clique seguinte abre do disco,
   sem a ida à rede no meio do gesto. requestIdleCallback para não competir
   com nada que o usuário esteja vendo; 2s de atraso para o boot de dados
   (que importa mais) passar na frente; só com sessão, porque na tela de
   login nada disso será usado. Com o service worker, o prefetch de hoje é a
   revisita instantânea de amanhã. Falha é silenciosa de propósito: prefetch
   é aposta, não promessa. */
/* SÓ O QUE A PESSOA PODE ABRIR. A lista era fixa e baixava as treze telas
   para todo mundo: uma vendedora com só "orcamentos" liberado puxava Gestão,
   Campanhas (a maior do projeto), Patrimônio, Permutas... telas que a própria
   rota dela recusa com "Você não tem acesso a este módulo". No 4G isso
   desfazia justamente o ganho da divisão por rota. Rota sem módulo (o
   glossário) alcança todo mundo. */
const ROTAS_PREFETCH = [
  { m: "contas-atrasadas", imp: () => import("./pages/ContasAtrasadas.jsx") },
  { m: "orcamentos", imp: () => import("./pages/Orcamentos.jsx") },
  { m: "compromissos", imp: () => import("./pages/Compromissos.jsx") },
  { m: "gestao", imp: () => import("./pages/Gestao.jsx") },
  { m: "permutas", imp: () => import("./pages/Permutas.jsx") },
  { m: "campanhas", imp: () => import("./pages/Campanhas.jsx") },
  { m: "manutencoes", imp: () => import("./pages/Manutencoes.jsx") },
  { m: "bancos", imp: () => import("./pages/Bancos.jsx") },
  { m: "patrimonio", imp: () => import("./pages/Patrimonio.jsx") },
  { m: "ativos", imp: () => import("./pages/Ativos.jsx") },
  { m: "licitacoes", imp: () => import("./pages/Licitacoes.jsx") },
  { m: "marketing", imp: () => import("./pages/Marketing.jsx") },
  { m: null, imp: () => import("./pages/Glossario.jsx") },
];
let prefetchFeito = false;
function prefetchRotas() {
  if (prefetchFeito) return;
  prefetchFeito = true;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  // Um por vez, cada um no seu pedaço de ociosidade: treze de uma vez
  // disputariam a banda exatamente com o boot dos dados.
  const fila = ROTAS_PREFETCH.filter((r) => !r.m || podeAbrir(r.m)).map((r) => r.imp);
  const proximo = () => {
    const imp = fila.shift();
    if (!imp) return;
    imp().catch(() => {}).finally(() => idle(proximo));
  };
  setTimeout(() => idle(proximo), 2000);
}

import { getSessao, aoMudarSessao, podeAbrir } from "./lib/sessao.js";
import { Card } from "./components/ui.jsx";

function SemAcesso() {
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
        <Lock size={22} strokeWidth={2.2} />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
        Voce nao tem acesso a este modulo
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Se precisar dele para o seu trabalho, fale com a direcao.
      </p>
    </Card>
  );
}

// Rota que so abre se o modulo estiver liberado para a sessao.
function Restrito({ modulo, sessao, children }) {
  return podeAbrir(modulo, sessao) ? children : <SemAcesso />;
}

export default function App() {
  const [sessao, setSessao] = useState(() => getSessao());

  // Mantem a tela em sincronia com o logout (inclusive o automatico, disparado
  // por sessao expirada dentro de uma chamada de dados).
  useEffect(() => aoMudarSessao(() => setSessao(getSessao())), []);

  // Com sessão na mão, as outras telas descem em segundo plano (ver ROTAS_PREFETCH).
  useEffect(() => { if (sessao) prefetchRotas(); }, [sessao]);

  if (!sessao) return <Login aoEntrar={() => setSessao(getSessao())} />;

  return (
    <Layout sessao={sessao}>
      {/* O Suspense e OBRIGATORIO com rota preguicosa: sem ele, a primeira
          troca de tela derruba o painel inteiro em vez de esperar o arquivo.
          O aviso e discreto de proposito -- a espera e de milissegundos numa
          rede boa, e uma tarja grande piscando a cada clique incomoda mais do
          que a espera que ela anuncia. */}
      <Suspense fallback={<p className="p-6 text-sm text-slate-400">Carregando…</p>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/contas-atrasadas"
          element={
            <Restrito modulo="contas-atrasadas" sessao={sessao}>
              <ContasAtrasadas />
            </Restrito>
          }
        />
        <Route
          path="/orcamentos"
          element={
            <Restrito modulo="orcamentos" sessao={sessao}>
              <Orcamentos />
            </Restrito>
          }
        />
        <Route
          path="/configuracoes"
          element={
            <Restrito modulo="configuracoes" sessao={sessao}>
              <Configuracoes />
            </Restrito>
          }
        />
        {/* Sem Restrito: qualquer pessoa logada precisa poder trocar a
            propria senha. A parte de administrar contas so aparece para a
            direcao, decidido dentro da propria tela. */}
        <Route
          path="/bancos"
          element={
            <Restrito modulo="bancos" sessao={sessao}>
              <Bancos />
            </Restrito>
          }
        />
        <Route
          path="/marketing"
          element={
            <Restrito modulo="marketing" sessao={sessao}>
              <Marketing />
            </Restrito>
          }
        />
        <Route
          path="/licitacoes"
          element={
            <Restrito modulo="licitacoes" sessao={sessao}>
              <Licitacoes />
            </Restrito>
          }
        />
        <Route
          path="/compromissos"
          element={
            <Restrito modulo="compromissos" sessao={sessao}>
              <Compromissos />
            </Restrito>
          }
        />
        <Route
          path="/gestao"
          element={
            <Restrito modulo="gestao" sessao={sessao}>
              <Gestao />
            </Restrito>
          }
        />
        <Route
          path="/manutencoes"
          element={
            <Restrito modulo="manutencoes" sessao={sessao}>
              <Manutencoes />
            </Restrito>
          }
        />
        <Route
          path="/permutas"
          element={
            <Restrito modulo="permutas" sessao={sessao}>
              <Permutas />
            </Restrito>
          }
        />
        <Route
          path="/campanhas"
          element={
            <Restrito modulo="campanhas" sessao={sessao}>
              <Campanhas />
            </Restrito>
          }
        />
        <Route
          path="/patrimonio"
          element={
            <Restrito modulo="patrimonio" sessao={sessao}>
              <Patrimonio />
            </Restrito>
          }
        />
        <Route
          path="/glossario"
          element={
            <Restrito modulo="glossario" sessao={sessao}>
              <Glossario />
            </Restrito>
          }
        />
        <Route path="/acessos" element={<Acessos />} />
        {/* Documentos/veiculos/maquinas nao sao dado financeiro: qualquer
            pessoa logada cuida deles (o servidor tambem so exige sessao). */}
        <Route path="/documentos" element={<Ativos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}
