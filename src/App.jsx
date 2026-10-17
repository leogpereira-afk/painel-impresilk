import NavegacaoPatrimonio from './components/patrimonio/Navegacao.jsx';
import {redirecionarManutencoes} from './lib/calc/navegacao-patrimonio.js';
import {redirecionarComercial} from './lib/calc/navegacao-comercial.js';
import CalendarioAbas from './components/CalendarioAbas.jsx';
// Sem sessao, o painel inteiro e a tela de login -- nem o Layout monta. Assim
// nenhuma rota "vaza" por digitar o endereco direto.
//
// A protecao por MODULO tem duas camadas: aqui (a rota recusa) e no servidor
// (a function recusa). A daqui e conforto; a que vale e a de la, porque o
// navegador esta sempre sob controle de quem usa.

import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import Layout from "./components/Layout.jsx";
import GuardaDeRota from "./components/GuardaDeRota.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";

/* CADA TELA VIRA UM ARQUIVO, e so desce quando alguem abre.
   Ate 18/08/2026 as 17 paginas entravam no MESMO arquivo: 313 kB comprimidos
   para quem so queria ver contas atrasadas -- vinham junto orcamentos, fluxo,
   gestao, patrimonio e a propria tela de Acessos. Numa rede de obra isso e a
   diferenca entre abrir e desistir.
   Login e Home ficam estaticos de proposito: sao a primeira coisa que todo
   mundo ve, e adiar o que ja vai ser pedido so acrescenta uma ida a rede. */
const CentralComercial = lazy(() => import("./pages/CentralComercial.jsx"));
const FerramentaBrief = lazy(() => import("./pages/FerramentaBrief.jsx"));
const Orcamentos = lazy(() => import("./pages/Orcamentos.jsx"));
const Configuracoes = lazy(() => import("./pages/Configuracoes.jsx"));
const Acessos = lazy(() => import("./pages/Acessos.jsx"));
const Backups = lazy(() => import("./pages/Backups.jsx"));
const Ativos = lazy(() => import("./pages/Ativos.jsx"));
const Planilhas = lazy(() => import("./pages/Planilhas.jsx"));
const FerramentaIA = lazy(() => import("./pages/FerramentaIA.jsx"));
const Marketing = lazy(() => import("./pages/Marketing.jsx"));
const Licitacoes = lazy(() => import("./pages/Licitacoes.jsx"));
const Manutencoes = lazy(() => import("./pages/Manutencoes.jsx"));
const Permutas = lazy(() => import("./pages/Permutas.jsx"));
const Campanhas = lazy(() => import("./pages/Campanhas.jsx"));
const Patrimonio = lazy(() => import("./pages/Patrimonio.jsx"));
const Agenda = lazy(() => import("./pages/Agenda.jsx"));
const Processos = lazy(() => import("./pages/Processos.jsx"));
const ColaborarProcesso = lazy(() => import("./pages/ColaborarProcesso.jsx"));
const Reunioes = lazy(() => import("./pages/Reunioes.jsx"));
const CalendarioEmpresa = lazy(() => import("./pages/CalendarioEmpresa.jsx"));

// Cada área carrega por uso. Baixar todas as rotas após o login concorria
// com a consulta inicial e trazia módulos que a pessoa talvez nem abrisse.

import { getSessao, aoMudarSessao, podeAbrir, ehDirecao, podeConfigurar } from "./lib/sessao.js";
import { Card } from "./components/ui.jsx";

function ManutencoesAntigas() {
  const {search} = useLocation();
  return <Navigate to={redirecionarManutencoes(search)} replace />;
}

function ComercialAntigo() {
  const {pathname,search,hash,state} = useLocation();
  return <Navigate to={redirecionarComercial(pathname,search,hash)} state={state} replace />;
}

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
  return (Array.isArray(modulo) ? modulo.some(m=>podeAbrir(m,sessao)) : podeAbrir(modulo, sessao)) ? children : <SemAcesso />;
}

export default function App() {
  const location=useLocation();
  const colaboracao=location.pathname==='/colaborar';
  const [sessao, setSessao] = useState(() => getSessao());

  // Mantem a tela em sincronia com o logout (inclusive o automatico, disparado
  // por sessao expirada dentro de uma chamada de dados).
  useEffect(() => aoMudarSessao(() => setSessao(getSessao())), []);


  /* GuardaDeRota em volta de todo Suspense de rota: sem ela, a tela que não
     carrega (arquivo antigo pedido depois de uma publicação nova) deixava o
     painel inteiro em branco. Ver components/GuardaDeRota.jsx. */
  if (colaboracao) return <GuardaDeRota chave={location.key}><Suspense fallback={<p className="p-6">Abrindo consultoria…</p>}><ColaborarProcesso/></Suspense></GuardaDeRota>;

  if (!sessao) return <Login aoEntrar={() => setSessao(getSessao())} />;

  /* SENHA PROVISORIA: SO MINHA CONTA ABRE, ate a pessoa escolher a dela
     (contrato das senhas, secao 5). O servidor manda a marca na entrada; a
     entrada unica, vendo a marca, nao planta os crachas dos outros sistemas.
     Qualquer outro endereco volta para /minha-conta. Sair continua no menu. */
  if (sessao.trocarSenha === true) {
    return (
      <Layout sessao={sessao}>
        <GuardaDeRota chave={location.key}>
          <Suspense fallback={<p className="p-6 text-sm text-slate-400">Carregando…</p>}>
            <Routes>
              <Route path="/minha-conta" element={<Acessos minhaConta />} />
              <Route path="*" element={<Navigate to="/minha-conta" replace />} />
            </Routes>
          </Suspense>
        </GuardaDeRota>
      </Layout>
    );
  }

  return (
    <Layout sessao={sessao}>
      {/* O Suspense e OBRIGATORIO com rota preguicosa: sem ele, a primeira
          troca de tela derruba o painel inteiro em vez de esperar o arquivo.
          O aviso e discreto de proposito -- a espera e de milissegundos numa
          rede boa, e uma tarja grande piscando a cada clique incomoda mais do
          que a espera que ela anuncia. */}
      <GuardaDeRota chave={location.key}>
      <Suspense fallback={<p className="p-6 text-sm text-slate-400">Carregando…</p>}>
      <Routes>
        <Route path="/" element={<Home sessao={sessao} />} />
        <Route
          path="/contas-atrasadas"
          element={
            <Restrito modulo="contas-atrasadas" sessao={sessao}>
              <ComercialAntigo />
            </Restrito>
          }
        />
        <Route path="/brief" element={<ComercialAntigo />} />
        <Route path="/layout" element={<FerramentaBrief tipo="layout" />} />
        <Route path="/comercial/*" element={<CentralComercial sessao={sessao} />} />
        <Route path="/orcamentos" element={<Restrito modulo="orcamentos" sessao={sessao}><ComercialAntigo /></Restrito>} />
        <Route
          path="/orcamentos/mesa"
          element={
            <Restrito modulo="orcamentos" sessao={sessao}>
              <Orcamentos />
            </Restrito>
          }
        />
        <Route
          path="/configuracoes"
          element={
            podeConfigurar(sessao) ? <Configuracoes /> : <SemAcesso />
          }
        />
        {/* Sem Restrito: qualquer pessoa logada precisa poder trocar a
            propria senha. A parte de administrar contas so aparece para a
            direcao, decidido dentro da propria tela. */}
        <Route
          path="/bancos"
          element={
            <Restrito modulo="bancos" sessao={sessao}>
              <ComercialAntigo />
            </Restrito>
          }
        />
        <Route path="/ferramenta-ia" element={<Restrito modulo="ferramenta-ia" sessao={sessao}><FerramentaIA /></Restrito>} />
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
              <ComercialAntigo />
            </Restrito>
          }
        />
        {/* As duas telas de agenda sao SO PARA VER. Nao ha rota de edicao
            porque nao ha edicao: a function painel-agenda nao tem acao de
            escrita. Quem programa continua no PCP; quem lanca evento da
            empresa, no RH. */}
        <Route
          path="/agenda"
          element={
            <Restrito modulo="agenda" sessao={sessao}>
              <><CalendarioAbas sessao={sessao}/><Agenda /></>
            </Restrito>
          }
        />
        <Route
          path="/calendario-empresa"
          element={
            <Restrito modulo="calendario-empresa" sessao={sessao}>
              <><CalendarioAbas sessao={sessao}/><CalendarioEmpresa sessao={sessao}/></>
            </Restrito>
          }
        />
        <Route path="/demandas" element={<Restrito modulo="demandas" sessao={sessao}><CalendarioAbas sessao={sessao}/><Processos key="demanda" tipo="demanda"/></Restrito>} />
        <Route path="/consultorias" element={<Restrito modulo="demandas" sessao={sessao}><CalendarioAbas sessao={sessao}/><Processos key="consultoria" tipo="consultoria"/></Restrito>} />
        <Route path="/reunioes" element={<Restrito modulo="reunioes" sessao={sessao}><CalendarioAbas sessao={sessao}/><Reunioes sessao={sessao}/></Restrito>} />
        <Route path="/gestao" element={<Navigate to="/" replace />} />
        <Route
          path="/patrimonio/manutencoes"
          element={
            <Restrito modulo="manutencoes" sessao={sessao}>
              <><NavegacaoPatrimonio sessao={sessao}/><Manutencoes /></>
            </Restrito>
          }
        />
        <Route
          path="/manutencoes" element={<Restrito modulo="manutencoes" sessao={sessao}><ManutencoesAntigas/></Restrito>} />
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
            <Restrito modulo={["patrimonio","inventario-valores","seguranca"]} sessao={sessao}>
              <><NavegacaoPatrimonio sessao={sessao}/><Patrimonio /></>
            </Restrito>
          }
        />
        <Route
          path="/glossario"
          element={
            <Restrito modulo="glossario" sessao={sessao}>
              <ComercialAntigo />
            </Restrito>
          }
        />
        <Route path="/acessos" element={<Acessos />} />
        <Route path="/minha-conta" element={<Acessos minhaConta />} />
        <Route path="/backups" element={ehDirecao(sessao) ? <Backups/> : <Navigate to="/minha-conta" replace/>} />
        {/* Documentos e ativos passa a exigir o modulo `documentos`, como
            qualquer outra tela. Ate 14/09/2026 esta rota abria sem `Restrito`
            e a porta de dados nao pedia modulo para documento/veiculo/
            maquina/seguro -- quem tivesse um unico modulo de consulta lia e
            APAGAVA certidao, contrato social e apolice. O corte que vale e o
            do painel-ativos; este aqui so evita a tela vazia. */}
        <Route
          path="/documentos"
          element={
            <Restrito modulo="documentos" sessao={sessao}>
              <Ativos sessao={sessao} />
            </Restrito>
          }
        />
        {/* O ITEM DE MENU NASCE DA LISTA DE MODULOS (CentralShell monta o menu
            com MODULOS.filter(podeAbrir)), entao acrescentar `planilhas` em
            src/lib/modulos.js ja o poe na lateral. Sem esta rota o clique caia
            no `path="*"` logo abaixo e voltava para o Inicio -- botao que leva
            ao lugar errado, sem erro nenhum. Modulo novo entra na lista E na
            rota, no mesmo commit. */}
        <Route
          path="/planilhas"
          element={
            <Restrito modulo="planilhas" sessao={sessao}>
              <Planilhas sessao={sessao} />
            </Restrito>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </GuardaDeRota>
    </Layout>
  );
}
