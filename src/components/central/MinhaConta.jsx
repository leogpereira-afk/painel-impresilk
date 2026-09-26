// MINHA CONTA: trocar a minha senha, e ela passa a valer em todos os meus
// sistemas (contrato A das senhas, acao `trocarMinhaSenha` do painel-auth).
//
// A pergunta do dono era "vale para todos?", e a tela antiga dizia "Troque a
// sua senha de entrada no painel" e, depois, so "Senha trocada". Agora ela diz
// ANTES em quais sistemas a senha vai valer e, DEPOIS, onde valeu, onde nao, e
// por que.
//
// A troca exige a senha atual SEMPRE, inclusive com a senha provisoria: e a
// prova de que quem troca e a pessoa. O servidor confere a atual onde ela vale
// (no Auth para conta migrada), com freio contra tentativa e reserva contra
// troca dupla.

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, KeyRound } from "lucide-react";
import { chamarAuth, ehDirecao, entrar, senhaTrocada } from "../../lib/sessao.js";
import { entradaUnica, meusSistemas } from "../../lib/entradaUnica.js";
import { prepararTroca, classificarErroTroca } from "../../lib/regra-senha.mjs";
import { mancheteDaSenha, resultadoDaSenha } from "../../lib/senha-previsao.mjs";
import { SISTEMAS, nomeCompletoSis } from "../../lib/sistemas.js";
import { Card, SectionTitle } from "../ui.jsx";
import { Avatar } from "../lista.jsx";
import {
  Aviso, CabecalhoDaArea, CampoSenha, IconeDoSistema, RegrasDaSenha, ResultadoSenhas, SaibaMais, nomeDoAvatar,
} from "../AreaSistemas.jsx";

const PREVIA = import.meta.env.MODE === "review";
const ORDEM = new Map(SISTEMAS.map((s, i) => [s.id, i]));
const PELA_ENTRADA = new Set(["central", "dre"]);

/* A troca em si. Mesma acao e mesmo corpo de sempre no painel-auth: a tela
   antiga, presa numa aba, continua funcionando e ganha o comportamento novo.
   Na previa nada e enviado: a resposta e um exemplo fixo. */
async function trocarNoServidor(senhaAtual, novaSenha) {
  if (PREVIA) {
    const { simularTrocaDeSenha } = await import("../../review/dados.mjs");
    return simularTrocaDeSenha();
  }
  return chamarAuth("trocarMinhaSenha", { senhaAtual, novaSenha });
}

/* "VAI VALER EM" e uma PREVISAO: sai da lista que a entrada unica gravou no
   aparelho (`meusSistemas()`). O exato so chega na resposta da troca. Na
   previa o aparelho nao tem essa lista; mostra um exemplo. */
function sistemasPrevistos() {
  const lista = meusSistemas();
  const ids = lista.length ? lista : PREVIA ? ["rh", "pcp", "brief", "dre", "central"] : [];
  return ["painel", ...ids.filter((s) => s !== "painel")]
    .sort((a, b) => (ORDEM.get(a) ?? 999) - (ORDEM.get(b) ?? 999));
}

function ValeEm({ ids }) {
  if (ids.length <= 1) {
    return (
      <p className="text-sm text-slate-600">
        No Painel e em todo sistema em que você tem conta. A lista exata aparece depois da troca.
      </p>
    );
  }
  return (
    <ul className="area-resultado rounded-xl border px-3">
      {ids.map((id) => (
        <li key={id} className="flex min-h-10 items-center gap-3 py-2 text-sm">
          <IconeDoSistema sistema={id} className="shrink-0 text-slate-500" />
          <span className="flex-1 text-slate-900">{nomeCompletoSis(id)}</span>
          {PELA_ENTRADA.has(id) && <span className="text-xs text-slate-500">pela entrada</span>}
        </li>
      ))}
    </ul>
  );
}

function ComoFunciona() {
  return (
    <SaibaMais titulo="Como funciona">
      <p>
        A troca vale no Painel, na entrada única (que abre os outros) e em cada sistema em que você
        tem conta, mesmo quando o seu login lá é diferente. Central do Léo e DRE não têm senha
        própria: abrem pela entrada. Se algum sistema não receber, a tela diz qual e por quê.
      </p>
    </SaibaMais>
  );
}

export default function MinhaConta({ sessao }) {
  const navegar = useNavigate();
  // SENHA PROVISORIA: quem entrou com a senha que a direcao definiu cai aqui
  // e so sai depois de escolher a sua. A trava que prende a pessoa nesta tela
  // e de App.jsx e sessao.js; aqui mora so o formulario.
  // Lida UMA vez, ao abrir: a marca sai da sessao guardada assim que a troca
  // da certo, e a tela tem de continuar no modo obrigatorio ate "Continuar"
  // (e o botao que planta os crachas com a senha nova).
  const [obrigatoria] = useState(() => sessao?.trocarSenha === true);
  const direcao = ehDirecao(sessao);
  const nome = sessao?.nome || sessao?.usuario || "";

  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erroAtual, setErroAtual] = useState("");
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [continuando, setContinuando] = useState(false);
  const campoAtual = useRef(null);
  const campoNova = useRef(null);
  // A senha nova so fica na memoria da tela ate plantar os crachas (modo
  // obrigatorio). Nunca vai para localStorage, endereco ou log.
  const novaGuardada = useRef("");

  const pedido = prepararTroca({ atual, nova, repetida });
  // No modo "Crie a sua senha" o campo de cima se chama "Senha provisoria":
  // a regra fala a mesma lingua do campo.
  const regras = obrigatoria
    ? pedido.regras.map((r) => (r.id === "diferente" ? { ...r, texto: "diferente da senha provisória" } : r))
    : pedido.regras;
  const ids = sistemasPrevistos();

  async function enviar(e) {
    e.preventDefault();
    if (!pedido.ok) {
      // Regra furada: nada e enviado. Marca de vermelho e volta ao campo.
      setTentou(true);
      if (pedido.faltaAtual) {
        setErroAtual("Digite a sua senha atual.");
        campoAtual.current?.focus();
      } else {
        campoNova.current?.focus();
      }
      return;
    }
    setEnviando(true);
    setErroAtual("");
    setAviso(null);
    try {
      const r = await trocarNoServidor(atual, nova);
      novaGuardada.current = obrigatoria ? nova : "";
      // Trocou: a marca sai da sessao ja (calada, para a tela mostrar "onde
      // valeu"). Recarregar agora nao prende a pessoa aqui de novo.
      if (obrigatoria && !PREVIA) senhaTrocada({ avisarTela: false });
      setResposta(r || { ok: true });
      setAtual("");
      setNova("");
      setRepetida("");
      setTentou(false);
    } catch (err) {
      const c = classificarErroTroca(err);
      if (c.onde === "atual") {
        // Senha atual errada: limpa SO a atual e volta nela. O resto fica.
        setErroAtual(c.texto);
        setAtual("");
        campoAtual.current?.focus();
      } else {
        setAviso({ tom: c.tom, texto: c.texto });
      }
    } finally {
      setEnviando(false);
    }
  }

  async function continuar() {
    // Depois da troca obrigatoria, a entrada unica planta os crachas dos outros
    // sistemas com a senha NOVA, e a sessao nova ja nao traz a marca.
    setContinuando(true);
    let entrou = false;
    try {
      if (!PREVIA && sessao?.usuario && novaGuardada.current) {
        const doPainel = await entradaUnica(sessao.usuario, novaGuardada.current);
        // A troca acabou de dar certo: a marca vai falsa mesmo que a resposta
        // traga outra coisa. Prender de novo quem acabou de trocar seria um
        // laco sem saida; o pior caso e entrar sem os crachas, e sair e entrar
        // de novo resolve.
        if (doPainel?.token) { entrar({ ...doPainel, trocarSenha: false }); entrou = true; }
      }
    } catch { /* sem rede: segue para o Inicio; a pessoa ja tem a senha nova */ }
    finally {
      // Sem a entrada unica (conta ainda nao consolidada, ou rede caida), a
      // sessao de agora continua, so sem a marca.
      if (!entrou && !PREVIA) senhaTrocada();
      novaGuardada.current = "";
      setContinuando(false);
      navegar("/");
    }
  }

  const titulo = obrigatoria ? "Crie a sua senha" : "Trocar a minha senha em todos os sistemas";
  const formulario = resposta ? (
    <div className="space-y-4">
      {(() => {
        const m = mancheteDaSenha(resposta, { modo: "minha" });
        return (
          <Aviso tom={m.tom}>
            <p>{m.texto}{PREVIA ? " (demonstração)" : ""}</p>
            {m.segunda && <p>{m.segunda}</p>}
          </Aviso>
        );
      })()}
      <ResultadoSenhas itens={resultadoDaSenha(resposta, { modo: "minha", usuario: sessao?.usuario })} titulo="Onde valeu" />
      {obrigatoria ? (
        <button type="button" className="btn-primary w-full" onClick={continuar} disabled={continuando}>
          {continuando ? "Entrando…" : "Continuar"}
        </button>
      ) : (
        <button type="button" className="btn-outline" onClick={() => setResposta(null)}>Pronto</button>
      )}
    </div>
  ) : (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <CampoSenha id="mc-atual" rotulo={obrigatoria ? "Senha provisória (a que você recebeu)" : "Senha atual"}
        valor={atual} aoMudar={(v) => { setAtual(v); if (erroAtual) setErroAtual(""); }}
        autoComplete="current-password" entradaRef={campoAtual} erro={erroAtual} />
      <div>
        <CampoSenha id="mc-nova" rotulo="Senha nova" valor={nova} aoMudar={setNova}
          autoComplete="new-password" entradaRef={campoNova} descrito="mc-regras"
          invalido={tentou && regras.some((r) => r.id !== "iguais" && !r.ok)} />
        <RegrasDaSenha id="mc-regras" regras={regras.filter((r) => r.id !== "iguais")} tentou={tentou} vazio={!nova} />
      </div>
      <div>
        <CampoSenha id="mc-repetida" rotulo="Repita a senha nova" valor={repetida} aoMudar={setRepetida}
          autoComplete="new-password" descrito="mc-iguais"
          invalido={tentou && !regras.find((r) => r.id === "iguais")?.ok} />
        <RegrasDaSenha id="mc-iguais" regras={regras.filter((r) => r.id === "iguais")} tentou={tentou} vazio={!repetida} />
      </div>
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      <button className={`btn-primary ${obrigatoria ? "w-full" : "area-cheio-estreito"}`} disabled={enviando}>
        <KeyRound size={16} aria-hidden="true" />
        {enviando ? (obrigatoria ? "Salvando…" : "Trocando…") : obrigatoria ? "Salvar e continuar" : "Trocar em todos os sistemas"}
      </button>
    </form>
  );

  if (obrigatoria) {
    return (
      <div className="area-sistemas">
        <div className="mx-auto max-w-md">
          <Card>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Crie a sua senha</h1>
            <Aviso tom="aviso" className="my-4">
              A senha que você recebeu é provisória. Escolha a sua para continuar.
            </Aviso>
            {PREVIA && <Aviso tom="info" className="mb-4">Demonstração: nenhuma senha é enviada.</Aviso>}
            {formulario}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="area-sistemas">
      <CabecalhoDaArea ativa="conta" sessao={sessao} />
      {PREVIA && <Aviso tom="info">Demonstração: nenhuma senha é enviada.</Aviso>}
      <div className="flex items-center gap-3">
        <Avatar nome={nomeDoAvatar(nome)} tamanho="h-10 w-10 text-sm" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{nome}</p>
          <p className="truncate text-sm text-slate-600">
            usuário <span className="font-mono">{sessao?.usuario}</span> · {direcao ? "Direção" : "Acesso da equipe"}
          </p>
        </div>
      </div>
      {/* Depois da troca, a PREVISAO sai da tela: ao lado de "Onde valeu" ela
          contradizia o resultado (previa Brief e Central, e o resultado dizia
          Pops sem conta). Quem manda depois da troca e a resposta do servidor. */}
      {!resposta && (
      <details className="area-so-estreito area-saiba rounded-xl border bg-white px-4">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium text-slate-900">
          {ids.length > 1 ? `Vale em ${ids.length} sistemas` : "Onde a senha vale"}
          <ChevronDown size={16} aria-hidden="true" className="area-seta text-slate-400" />
        </summary>
        <div className="space-y-2 pb-3">
          <ValeEm ids={ids} />
          <ComoFunciona />
        </div>
      </details>
      )}
      <div className="area-duas-colunas">
        <Card>
          <SectionTitle titulo={titulo} sub="Uma senha só para entrar no Painel e nos outros sistemas." />
          {formulario}
        </Card>
        {!resposta && (
          <Card className="area-so-largo">
            <SectionTitle titulo="Vai valer em" />
            <div className="space-y-2">
              <ValeEm ids={ids} />
              <ComoFunciona />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
