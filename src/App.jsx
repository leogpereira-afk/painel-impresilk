// Sem sessao, o painel inteiro e a tela de login -- nem o Layout monta. Assim
// nenhuma rota "vaza" por digitar o endereco direto.
//
// A protecao por MODULO tem duas camadas: aqui (a rota recusa) e no servidor
// (a function recusa). A daqui e conforto; a que vale e a de la, porque o
// navegador esta sempre sob controle de quem usa.

import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Lock } from "lucide-react";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import ContasAtrasadas from "./pages/ContasAtrasadas.jsx";
import FluxoCaixa from "./pages/FluxoCaixa.jsx";
import Produtos from "./pages/Produtos.jsx";
import Orcamentos from "./pages/Orcamentos.jsx";
import Configuracoes from "./pages/Configuracoes.jsx";
import Login from "./pages/Login.jsx";
import Acessos from "./pages/Acessos.jsx";
import Ativos from "./pages/Ativos.jsx";
import Bancos from "./pages/Bancos.jsx";
import Marketing from "./pages/Marketing.jsx";
import Licitacoes from "./pages/Licitacoes.jsx";
import Glossario from "./pages/Glossario.jsx";
import Compromissos from "./pages/Compromissos.jsx";
import Manutencoes from "./pages/Manutencoes.jsx";
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

  if (!sessao) return <Login aoEntrar={() => setSessao(getSessao())} />;

  return (
    <Layout sessao={sessao}>
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
          path="/fluxo-caixa"
          element={
            <Restrito modulo="fluxo-caixa" sessao={sessao}>
              <FluxoCaixa />
            </Restrito>
          }
        />
        <Route
          path="/produtos"
          element={
            <Restrito modulo="produtos" sessao={sessao}>
              <Produtos />
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
          path="/manutencoes"
          element={
            <Restrito modulo="manutencoes" sessao={sessao}>
              <Manutencoes />
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
    </Layout>
  );
}
