// AS PECAS DA AREA "Sistemas e configuracoes": cabecalho com as abas, avisos,
// "Saiba mais", e tudo o que mostra ou pede uma senha.
//
// Uma fileira de abas so, no topo de todas as telas da area. Antes eram duas
// navegacoes empilhadas (as pilulas da area e, dentro do cartao, as abas
// Sistemas/Pessoas), e o dono rolou seis blocos procurando uma aba que estava
// escondida no meio. Sistemas e Pessoas agora sao abas de primeiro nivel.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, Check, ChevronDown, Copy, Eye, EyeOff, Info, LogIn, Share2, X,
} from "lucide-react";
import JanelaFormulario from "./JanelaFormulario.jsx";
import { PageTitle } from "./ui.jsx";
import { Selo } from "./lista.jsx";
import { iconeDoSistema } from "./iconesDosSistemas.js";
import { ehDirecao, getSessao, podeConfigurar } from "../lib/sessao.js";
import { doSistema } from "../lib/sistemas.js";
import "./area-sistemas.css";

/* A SESSAO QUE A AREA ENXERGA. Fora da previa e a de sempre. Na previa
   (npm run review) e uma conta de direcao ficticia, e `?cenario=equipe` (antes
   do #) finge uma conta SEM direcao: sem isso nao havia como fotografar o que a
   equipe ve nesta area. `?cenario=provisoria` finge quem entrou com senha
   provisoria, para mostrar a tela "Crie a sua senha". Nada disso existe fora
   da previa. */
export function cenarioDaPrevia() {
  if (import.meta.env.MODE !== "review") return "";
  try { return new URLSearchParams(window.location.search).get("cenario") || ""; } catch { return ""; }
}

export function sessaoDaArea() {
  if (import.meta.env.MODE === "review") {
    const cenario = cenarioDaPrevia();
    if (cenario === "equipe") {
      return { usuario: "equipe.exemplo", nome: "Conta da equipe", master: false, permissoes: ["orcamentos", "marketing"] };
    }
    return {
      usuario: "direcao.exemplo", nome: "Conta de demonstração", master: true, permissoes: ["*"],
      ...(cenario === "provisoria" ? { trocarSenha: true } : {}),
    };
  }
  return getSessao();
}

const ABAS = [
  { id: "geral", nome: "Visão geral", para: "/acessos", quem: "direcao" },
  { id: "sistemas", nome: "Sistemas", para: "/acessos?visao=sistemas", quem: "direcao" },
  { id: "pessoas", nome: "Pessoas", para: "/acessos?visao=pessoas", quem: "direcao" },
  { id: "conta", nome: "Minha conta", para: "/minha-conta", quem: "todos" },
  { id: "backup", nome: "Backups", para: "/backups", quem: "direcao" },
  { id: "configuracoes", nome: "Configurações", para: "/configuracoes", quem: "configurar" },
];

const DESCRICAO_DIRECAO = {
  geral: "O que pede atenção nos acessos e nas cópias de segurança.",
  sistemas: "Quem entra em cada sistema, e com que login.",
  pessoas: "O que cada pessoa acessa, e a senha dela.",
  conta: "A sua senha, a mesma em todos os sistemas.",
  backup: "As cópias de segurança de cada sistema.",
  configuracoes: "Regras de cada módulo do Painel. As gerais salvam sozinhas; as outras têm botão Salvar.",
};
const DESCRICAO_EQUIPE = {
  conta: "A sua senha, a mesma em todos os sistemas.",
  configuracoes: "Regras dos módulos que você cuida.",
};

/* QUEM VE CADA ABA. A regra de quem administra e a de lib/sessao.js
   (`ehDirecao`, so `master`), nunca escrita a mao aqui: escrever a regra de
   novo numa tela foi o que fez quem tinha "*" ler a promessa e nao achar a
   tela. Minha conta e de todo mundo; Configuracoes, de quem cuida de algum
   modulo. */
export function abasVisiveis(sessao) {
  return ABAS.filter((a) =>
    a.quem === "todos" ? true : a.quem === "configurar" ? podeConfigurar(sessao) : ehDirecao(sessao));
}

export function AbasDaArea({ ativa, sessao }) {
  const trilho = useRef(null);
  const abas = abasVisiveis(sessao);
  // No celular a fileira rola de lado numa linha so. A aba ativa vem para o
  // meio: aberta em "Configuracoes", ela nasceria fora da vista, a direita.
  useEffect(() => {
    const el = trilho.current;
    const alvo = el?.querySelector('[aria-current="page"]');
    if (!el || !alvo || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = alvo.offsetLeft - (el.clientWidth - alvo.offsetWidth) / 2;
  }, [ativa]);
  // Com uma aba so, a fileira nao aparece: uma aba sozinha nao escolhe nada.
  if (abas.length < 2) return null;
  return (
    <nav aria-label="Seções de sistemas e configurações" className="area-abas sem-impressao">
      <div ref={trilho} className="area-abas-trilho">
        <div className="area-abas-grupo inline-flex gap-1 rounded-xl border bg-white p-1">
          {abas.map((a) => (
            <Link
              key={a.id}
              to={a.para}
              aria-current={ativa === a.id ? "page" : undefined}
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-4 font-display text-sm font-medium transition-colors ${
                ativa === a.id ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {a.nome}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

/* O titulo acompanha o menu: para a direcao a pagina se chama "Sistemas e
   configuracoes" e a aba diz onde esta. Para quem nao e direcao, o titulo e o
   nome da aba ("Minha conta"): chamar de "Acessos" dava a entender que dava
   para liberar modulo por aqui. */
export function CabecalhoDaArea({ ativa, sessao }) {
  const direcao = ehDirecao(sessao);
  const aba = ABAS.find((a) => a.id === ativa);
  return (
    <div className="area-cabecalho">
      <PageTitle
        titulo={direcao ? "Sistemas e configurações" : aba?.nome || "Minha conta"}
        descricao={direcao ? DESCRICAO_DIRECAO[ativa] : DESCRICAO_EQUIPE[ativa]}
      />
      <AbasDaArea ativa={ativa} sessao={sessao} />
    </div>
  );
}

const TOM_AVISO = {
  ok: { caixa: "bg-ok-50 text-ok-700", Icone: Check, papel: "status" },
  aviso: { caixa: "bg-warn-50 text-warn-800", Icone: AlertTriangle, papel: "alert" },
  erro: { caixa: "bg-bad-50 text-bad-700", Icone: AlertCircle, papel: "alert" },
  info: { caixa: "bg-brand-50 text-brand-700", Icone: Info, papel: "status" },
};
// Os nomes antigos das mensagens ("warn") continuam valendo.
const ALIAS = { warn: "aviso", bad: "erro", neutral: "info" };

export function Aviso({ tom = "info", children, aoFechar, acao, className = "" }) {
  if (!children) return null;
  const t = TOM_AVISO[ALIAS[tom] || tom] || TOM_AVISO.info;
  const { Icone } = t;
  return (
    <div role={t.papel} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${t.caixa} ${className}`}>
      <Icone size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 space-y-1">{children}</div>
        {acao && <div className="-my-1.5 flex flex-wrap gap-2">{acao}</div>}
      </div>
      {aoFechar && (
        <button type="button" onClick={aoFechar} aria-label="Fechar aviso" title="Fechar aviso"
          className="-my-2 -mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-white">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* GRUDADO NO TOPO. A lista de gente e longa e o cartao da pessoa fica bem
   abaixo: quem marcava um modulo na Karen recebia o aviso la em cima, fora do
   campo de visao, e o clique parecia nao ter feito nada. Foi assim que a
   direcao passou dois dias achando que a marcacao de Permutas simplesmente
   "nao pegava": o servidor estava recusando e dizendo, e ninguem via. Agora a
   resposta de TODA acao da area cai aqui, em todas as abas. */
export function AvisoGrudado({ aviso, aoFechar }) {
  if (!aviso) return null;
  return (
    <div className="area-grudado sticky top-2 z-30" aria-live="polite">
      <Aviso tom={aviso.tom} aoFechar={aoFechar} acao={aviso.acao}>{aviso.texto}</Aviso>
    </div>
  );
}

export function SaibaMais({ titulo = "Saiba mais", children, className = "" }) {
  return (
    <details className={`area-saiba ${className}`}>
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-700">
        {titulo}
        <ChevronDown size={16} aria-hidden="true" className="area-seta" />
      </summary>
      <div className="space-y-2 pt-1 text-sm text-slate-600">{children}</div>
    </details>
  );
}

// A palavra de cada estado de acesso, pela `chave` de estadoDoPapel. A funcao
// continua intacta (o teste e as contagens usam ela); a palavra da tela e esta.
export const PALAVRA_DO_ESTADO = {
  ok: "em ordem",
  temporaria: "senha provisória",
  vazia: "sem nenhuma parte",
  fantasma: "conta não existe lá",
  desativada: "desativada",
  externa: "gestão externa",
};

export function IconeDoSistema({ sistema, size = 16, className = "" }) {
  const Icone = sistema === "entrada" ? LogIn : iconeDoSistema(doSistema(sistema));
  return <Icone size={size} className={className} aria-hidden="true" />;
}

// ------------------------------------------------------------------ senhas

export function CampoSenha({ id, rotulo, valor, aoMudar, autoComplete, erro, entradaRef, invalido, descrito }) {
  const [ver, setVer] = useState(false);
  const idErro = `${id}-erro`;
  return (
    <div>
      <label className="label" htmlFor={id}>{rotulo}</label>
      <div className="relative">
        <input
          id={id}
          ref={entradaRef}
          type={ver ? "text" : "password"}
          className="input pr-12"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={invalido || erro ? true : undefined}
          aria-describedby={[erro ? idErro : "", descrito || ""].filter(Boolean).join(" ") || undefined}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Esconder senha" : "Mostrar senha"}
          title={ver ? "Esconder senha" : "Mostrar senha"}
          aria-pressed={ver}
          className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          {ver ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {erro && <p id={idErro} className="mt-1 text-sm text-bad-700">{erro}</p>}
    </div>
  );
}

/* AS REGRAS NA VISTA, antes de enviar. Cinza enquanto nada foi tentado;
   cumprida vira verde; tentou enviar e nao cumpriu vira vermelho. O botao de
   enviar fica sempre habilitado: botao cinza sem dizer por que e pior do que
   deixar tentar e mostrar o que falta. */
export function RegrasDaSenha({ id, regras, tentou, vazio }) {
  if (!regras?.length) return null;
  return (
    <ul id={id} aria-live="polite" className="mt-2 space-y-1 text-sm">
      {regras.map((r) => {
        // Campo ainda vazio: tudo cinza. "Sem espaco nas pontas" verde num
        // campo em branco pareceria meio caminho andado.
        const estado = vazio && !tentou ? "espera" : r.ok ? "ok" : tentou ? "ruim" : "espera";
        return (
          <li key={r.id} className={`flex items-center gap-2 ${
            estado === "ok" ? "text-ok-700" : estado === "ruim" ? "text-bad-700" : "text-slate-500"
          }`}>
            {estado === "ok" ? <Check size={14} aria-hidden="true" className="shrink-0" />
              : estado === "ruim" ? <X size={14} aria-hidden="true" className="shrink-0" />
                : <span aria-hidden="true" className="mx-[4px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />}
            <span>
              {r.texto}
              <span className="sr-only">{estado === "ok" ? ": cumprida" : estado === "ruim" ? ": falta cumprir" : ""}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ONDE VALEU (ou onde vai valer). Uma linha por sistema, com a palavra e a cor
   do resultado. A ordem ja vem pronta de lib/senha-previsao.mjs. */
export function ResultadoSenhas({ itens, titulo }) {
  if (!itens?.length) return null;
  return (
    <div>
      {titulo && <p className="label">{titulo}</p>}
      <ul className="area-resultado rounded-xl border px-3">
        {itens.map((i) => (
          <li key={i.chave} className="flex min-h-10 items-center gap-3 py-2 text-sm">
            <IconeDoSistema sistema={i.sistema} className="shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{i.nome}</p>
              {i.detalhe && <p className="text-xs text-slate-500">{i.detalhe}</p>}
              {i.destaque && <p className="text-xs text-slate-700">{i.destaque}</p>}
            </div>
            <Selo tom={i.tom}>{i.selo}</Selo>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* A GUARDA DE FECHAR SEM COPIAR. A senha aparece uma vez e nao fica guardada
   em lugar nenhum legivel. Quem fecha pelo X ou pelo Esc sem ter copiado nem
   enviado ouve a pergunta antes; "Ja anotei, fechar" e a decisao explicita e
   fecha direto. */
export function useGuardaDaSenha(aoFechar) {
  const [guardou, setGuardou] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  return {
    pedirFechar: () => (guardou ? aoFechar() : setConfirmando(true)),
    guarda: {
      aoGuardar: () => { setGuardou(true); setConfirmando(false); },
      aoFechar,
      confirmandoFechar: confirmando,
      aoVoltar: () => setConfirmando(false),
    },
  };
}

/* A SENHA MOSTRADA UMA VEZ. Nasceu como uma caixa no topo do cartao da pessoa;
   no celular ela nascia 600px acima dos botoes que a geravam, e o dono clicava
   "gerar senha", nada acontecia na vista dele, e a unica senha que ele veria na
   vida ficava rolagem acima. Agora ela mora numa janela, que esta sempre na
   vista.

   Grande e selecionavel: no celular, ler uma senha de 20 caracteres em corpo 12
   e digita-la em outro app e onde o erro acontece.

   SAIU O LINK DO WHATSAPP (wa.me/?text=): ele punha a senha dentro de um
   endereco, que fica no historico do navegador e passa pelo servidor do
   WhatsApp. No lugar, "Enviar..." abre a folha de compartilhar do aparelho (no
   celular, o WhatsApp esta la) e a senha nao vira endereco. */
export function ConteudoSenha({
  nome, sistemaNome, senha, login, provisoria, porta, manchete, itens,
  aoGuardar, aoFechar, confirmandoFechar, aoVoltar,
}) {
  const [copiou, setCopiou] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const podeEnviar = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const recado = `Sua senha de acesso${login ? ` (login ${login})` : ""}: ${senha}`
    + (provisoria ? "\n\nÉ provisória: o sistema pede para você trocar na primeira entrada." : "");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiou(true);
      setFalhou(false);
      aoGuardar?.();
    } catch {
      // Sem permissao de area de transferencia (navegador antigo, http): a
      // senha esta selecionavel logo acima, e dizer isso vale mais que um
      // botao que nao faz nada.
      setCopiou(false);
      setFalhou(true);
    }
  }
  async function enviar() {
    try {
      await navigator.share({ text: recado });
      aoGuardar?.();
    } catch { /* a pessoa desistiu da folha de compartilhar: nada a fazer */ }
  }

  return (
    <div className="space-y-4">
      {manchete && (
        <Aviso tom={manchete.tom}>
          <p>{manchete.texto}</p>
          {manchete.segunda && <p>{manchete.segunda}</p>}
        </Aviso>
      )}
      <div className="rounded-xl border-2 border-brand bg-brand-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          Senha de {nome}{sistemaNome ? ` no ${sistemaNome}` : ""}
        </p>
        {login && <p className="text-sm text-slate-600">Login: <span className="font-mono">{login}</span></p>}
        <p className="mt-2 flex min-h-11 select-all items-center break-all font-mono text-2xl font-semibold tracking-tight text-slate-900">
          {senha}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary h-10" onClick={copiar}>
            {copiou ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copiou ? "Copiada" : "Copiar senha"}
          </button>
          {podeEnviar && (
            <button type="button" className="btn-outline h-10" onClick={enviar}>
              <Share2 size={16} aria-hidden="true" /> Enviar…
            </button>
          )}
        </div>
        {falhou && (
          <p className="mt-2 text-sm text-warn-700" role="alert">
            Não consegui copiar por aqui. Toque e segure na senha para selecionar.
          </p>
        )}
        <p className="mt-3 text-sm text-slate-700">
          Esta senha <b>não aparece de novo</b>.{" "}
          {porta ? "É definitiva: porta compartilhada."
            : provisoria ? "É provisória: ela troca na próxima entrada."
              : "Não é provisória: o sistema não pede troca."}
        </p>
      </div>
      <ResultadoSenhas itens={itens} titulo={itens?.length ? "Onde valeu" : ""} />
      {/* Rodape grudado no fim da janela: no celular a pergunta "Fechar assim
          mesmo?" nascia abaixo da dobra, e quem tocou no X nao via a resposta
          nem os botoes dela. */}
      <div className="area-rodape-fixo flex flex-wrap items-center justify-end gap-2">
        {confirmandoFechar ? (
          <>
            <p className="mr-auto text-sm font-medium text-slate-900" role="alert">
              A senha não aparece de novo. Fechar assim mesmo?
            </p>
            <button type="button" className="btn-danger h-10" onClick={aoFechar}>Fechar</button>
            <button type="button" className="btn-ghost h-10" onClick={aoVoltar}>Voltar</button>
          </>
        ) : (
          <button type="button" className="btn-outline" onClick={aoFechar}>Já anotei, fechar</button>
        )}
      </div>
    </div>
  );
}

/** A janela com a senha nova de um cadastro, de um "Dar acesso" ou de uma senha so num sistema. */
export function JanelaSenha({ titulo, aoFechar, ...conteudo }) {
  const { pedirFechar, guarda } = useGuardaDaSenha(aoFechar);
  return (
    <JanelaFormulario titulo={titulo} classe="janela-estreita" aoFechar={pedirFechar}>
      <ConteudoSenha {...conteudo} {...guarda} />
    </JanelaFormulario>
  );
}

/** O nome que vai para o Avatar: so palavras com letra (um "·" ou um "-" no
    nome virava a segunda inicial). */
export const nomeDoAvatar = (nome) =>
  String(nome || "").split(/\s+/).filter((p) => /\p{L}/u.test(p)).join(" ") || String(nome || "?");
