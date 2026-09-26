// Quem entra em cada sistema, num lugar so.
//
// Antes desta tela, saber "o que a Barbara acessa" era abrir tres sistemas e
// somar de cabeca: as contas viviam em duas tabelas, uma delas com uma linha
// por pessoa POR SISTEMA. Aqui e uma linha por PESSOA, e o que muda por sistema
// e o papel.
//
// O QUE MUDOU EM 16/08/2026, E POR QUE
// Ate hoje esta tela mostrava a TABELA CONSOLIDADA e chamava aquilo de verdade.
// So que a tabela guardava intencao, nao fato: ela dizia "o Leonardo entra no
// PCP" enquanto a conta que existe la se chama `leo`. O dono passou cinco
// tentativas digitando um usuario que nao existe, olhando para uma tela que
// dizia que ele tinha acesso. Vinte e uma linhas estavam assim.
//
// Agora cada sistema e PERGUNTADO, e a tela mostra tres coisas que antes nao
// existiam: o LOGIN com que a pessoa entra ali, se aquela conta EXISTE, e as
// contas que existem la e nao sao de ninguem aqui (as "soltas": quase sempre
// a mesma pessoa com o nome escrito de outro jeito).
//
// E ha duas lentes, porque sao duas perguntas diferentes:
//   · Pessoas:  "o que o Pedro acessa?"
//   · Sistemas: "quem entra no PCP, e com que login?"
// Desde o redesenho de 26/09/2026 as duas sao ABAS da area (Sistemas e
// Pessoas, no topo), e nao mais abas dentro de um cartao.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, AtSign, ChevronDown, ChevronRight, DoorOpen, ExternalLink, KeyRound, Link2,
  MoreHorizontal, Pencil, Plus, Power, RefreshCw, Search, UserPlus, X,
} from "lucide-react";
import {
  lerAcessos, salvarConta, salvarPapel, removerPapel,
  criarPessoa, definirSenha, desativar, apontarLogin, senhaDoSistema,
} from "../services/acesso.js";
import { estadoDoPapel, temPendencia, temSenhaProvisoria, contarAcessos, situacaoEntrada } from "../lib/acesso-state.mjs";
import { contasDoSistema, seloDoSistema, ehExterna } from "../lib/acesso-sistema.mjs";
import {
  previsaoDaSenha, resultadoDaSenha, mancheteDaSenha, avisoDeTroca, quantosReceberam, provisoriaNoSistema,
} from "../lib/senha-previsao.mjs";
import { conferirSenha, prepararDefinicao } from "../lib/regra-senha.mjs";
import { Empty, ErroModulo, AvisoAtualizacao, Skeleton } from "./ui.jsx";
import { Selo, FaixaNumeros, LinhaLista, Avatar } from "./lista.jsx";
import JanelaFormulario from "./JanelaFormulario.jsx";
import {
  Aviso, SaibaMais, JanelaSenha, ConteudoSenha, ResultadoSenhas, CampoSenha, RegrasDaSenha,
  useGuardaDaSenha, PALAVRA_DO_ESTADO, IconeDoSistema, nomeDoAvatar,
} from "./AreaSistemas.jsx";
import { MODULOS, COM_DINHEIRO, somenteValidos } from "../lib/modulos.js";
import { lerSetores } from "../services/patrimonio.js";
import { lerPlanilhas, lerSetoresDaPessoa, salvarSetoresDaPessoa } from "../services/planilhas.js";
import { SISTEMAS as SISTEMAS_CASA, doSistema, nomeCompletoSis, papelAoCriar } from "../lib/sistemas.js";

/* Nome, endereco, pagina de acessos, papeis e papel inicial de cada sistema
   vinham de CINCO constantes escritas aqui. Agora saem todas de um registro so
   (lib/sistemas.js), para que acrescentar um sistema seja um bloco la e nao
   uma cacada por seis lugares. Ver a lista de passos no fim daquele arquivo.
   E o nome na tela e SEMPRE o completo ("Pops & Fabricacao", "Brief de
   Medicao"): o mesmo sistema aparecia com dois nomes em abas vizinhas. */
const PAPEIS = Object.fromEntries(SISTEMAS_CASA.map((s) => [s.id, s.papeis]));
const PAPEL_INICIAL = Object.fromEntries(SISTEMAS_CASA.map((s) => [s.id, s.papelInicial]));
const ORDEM = new Map(SISTEMAS_CASA.map((s, i) => [s.id, i]));
const porOrdem = (a, b) => (ORDEM.get(a) ?? 999) - (ORDEM.get(b) ?? 999);

// "ADMIN_RH" aparece "admin rh"; o valor gravado nao muda.
const rotuloPapel = (papel) => String(papel || "").toLowerCase().replace(/_/g, " ");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const TOM_DO_ESTADO = { ok: "ok", temporaria: "warn", vazia: "bad", fantasma: "bad", desativada: "neutral", externa: "neutral" };

/* POR ONDE A PESSOA ENTRA quando nao tem conta. Duas destas sao acesso de
   verdade e nao apareciam em lugar nenhum: o instalador do PCP toca no proprio
   nome (a LISTA E a credencial) e o fornecedor do Compras abre as telas dele
   por um link publico. A terceira e so cadastro: a pessoa existe no sistema e
   nao entra. */
const COMO_ENTRA = {
  nome: { selo: "entra sem senha", tom: "warn", resumo: "entram sem senha" },
  link: { selo: "entra por link", tom: "warn", resumo: "entram por link" },
  cadastro: { selo: "", tom: "neutral", resumo: "" },
};

/* O QUE A FALHA DE LOGIN QUER DIZER, e o que fazer com ela. Os dois motivos sao
   problemas OPOSTOS e pedem botoes diferentes:
     · "senha errada": a pessoa SABE o login e erra a senha. Gerar senha nova.
     · "nao existe": ela esta digitando um login que nao existe. Trocar a
       senha nao resolve NADA; e o caso do dono no PCP, cinco tentativas com
       um usuario que nao existia.
   Sem essa distincao a tela mostraria "4 falhas" e deixaria a conclusao por
   conta de quem olha, que foi como o problema durou onze dias. */
function lerFalha(e) {
  const m = String(e.motivo || "").toLowerCase();
  if (m.includes("nao existe") || m.includes("não existe") || m.includes("usuário não") || m.includes("usuario nao")) {
    return { texto: "está digitando um login que não existe ali", acao: "apontar" };
  }
  if (m.includes("desativada") || m.includes("barrada") || m.includes("travada")) {
    return { texto: "está barrada: conta desativada ou porta travada", acao: "reativar" };
  }
  if (m.includes("senha")) return { texto: "falha relacionada à senha", acao: "senha" };
  return { texto: e.motivo || "não conseguiu entrar", acao: "" };
}

const VAZIA = { usuario: "", nome: "", tipo: "pessoa", colaborador: "", freelancerId: "" };

/* CADASTRAR PESSOA. Mora numa janela desde 26/09/2026: aberto no meio da lista,
   o formulario tinha 4.474px e empurrava as pessoas para baixo. */
function NovaPessoa({ sistemas, vendedores, contratos, aoCriar, aoCancelar }) {
  const [f, setF] = useState(VAZIA);
  const [vend, setVend] = useState("");
  const [papeis, setPapeis] = useState({});
  // O Painel nao tem papel: tem lista de partes. Sem escolher aqui, a pessoa
  // nascia com acesso a NADA dentro do painel: entrava e nao via tela nenhuma.
  const [modulos, setModulos] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const alternar = (sis) =>
    setPapeis((p) => {
      const n = { ...p };
      if (n[sis] === undefined) n[sis] = PAPEL_INICIAL[sis] ?? "";
      else delete n[sis];
      return n;
    });

  const enviar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await aoCriar(f, Object.entries(papeis).map(([sistema, papel]) => ({
        sistema, papel,
        ...(sistema === "painel" ? { permissoes: modulos, vendedorId: vend.trim() } : {}),
      })));
    } finally {
      setSalvando(false);
    }
  };

  const lista = [...sistemas].sort(porOrdem);

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="np-u">Usuário (como ela digita para entrar)</label>
          <input id="np-u" className="input" value={f.usuario} required autoCapitalize="none"
            placeholder="ex.: joao"
            onChange={(e) => setF((x) => ({ ...x, usuario: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="np-n">Nome</label>
          <input id="np-n" className="input" value={f.nome}
            onChange={(e) => setF((x) => ({ ...x, nome: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="np-t">O que é esta conta</label>
          <select id="np-t" className="select" value={f.tipo}
            onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}>
            <option value="pessoa">Uma pessoa do quadro</option>
            <option value="terceirizado">Terceirizado (sem ficha no RH)</option>
            <option value="funcao">Porta compartilhada (uma função)</option>
          </select>
        </div>
        {/* TERCEIRIZADO PEDE PRAZO E RESPONSAVEL, e o banco recusa sem os dois.
            Nao e burocracia: ele nao tem RH que o desligue. Sem data de fim, o
            acesso dura para sempre por omissao, que e como acesso esquecido
            vira porta aberta. O responsavel existe para haver a quem perguntar
            quando o prazo vencer. */}
        {/* O CONTRATO VEM DO RH, E A DATA NAO SE DIGITA DE NOVO. Antes esta tela
            pedia "vale ate" e "responsavel": os mesmos dois campos que a aba
            de Contratos de freelancer ja guarda. Duas datas para o mesmo fato e
            o comeco de toda divergencia: uma envelhece e ninguem descobre qual.
            Escolhendo o contrato, a validade e LIDA de la a cada conferencia:
            renovou no RH, a porta reabre sozinha; encerrou, fecha. */}
        {f.tipo === "terceirizado" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="np-ct">Contrato no RH</label>
            <select id="np-ct" className="select" value={f.freelancerId || ""}
              onChange={(e) => setF((x) => ({ ...x, freelancerId: e.target.value }))}>
              <option value="">Escolha o contrato</option>
              {(contratos || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}{c.funcao ? ` · ${c.funcao}` : ""}{c.fim ? ` · vale até ${new Date(`${c.fim}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                </option>
              ))}
            </select>
            {(contratos || []).length === 0 ? (
              <p className="mt-1 text-sm text-warn-700">
                Nenhum contrato aberto. Cadastre em <b>RH → Contratos de freelancer</b> primeiro: é de lá
                que sai a data que fecha o acesso.
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                A validade sai do contrato. Renovou no RH, a porta reabre sozinha; encerrou, fecha.
              </p>
            )}
          </div>
        )}
        <div>
          <label className="label" htmlFor="np-c">Quem é no RH</label>
          <input id="np-c" className="input" list="rh-colaboradores" value={f.colaborador}
            placeholder="obrigatório para dar acesso ao RH"
            onChange={(e) => setF((x) => ({ ...x, colaborador: e.target.value }))} />
        </div>
      </div>

      <fieldset>
        <legend className="label">Em quais sistemas ela entra</legend>
        <div className="area-linhas rounded-xl border">
          {lista.map((sis) => {
            const marcado = papeis[sis] !== undefined;
            return (
              <div key={sis}>
                <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3">
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm text-slate-900">
                    <input type="checkbox" checked={marcado} onChange={() => alternar(sis)}
                      className="h-5 w-5 shrink-0 rounded border-slate-300 text-brand focus:ring-brand-200" />
                    <IconeDoSistema sistema={sis} className="shrink-0 text-slate-500" />
                    {nomeCompletoSis(sis)}
                  </label>
                  {marcado && (PAPEIS[sis] || []).length > 0 && (
                    <select className="select h-10 w-auto text-sm" value={papeis[sis]}
                      aria-label={`Papel no ${nomeCompletoSis(sis)}`}
                      onChange={(e) => setPapeis((p) => ({ ...p, [sis]: e.target.value }))}>
                      {PAPEIS[sis].map((o) => <option key={o} value={o}>{rotuloPapel(o)}</option>)}
                    </select>
                  )}
                </div>
                {marcado && sis === "painel" && (
                  <div className="px-3 pb-3">
                    {/* SEM ISTO A VENDEDORA NOVA VE A MESA INTEIRA. O formulario
                        nunca passava vendedorId (karen, pedro e raphael estao
                        com o campo vazio ate hoje), e ninguem percebe: lista
                        cheia parece certa. */}
                    <label className="label" htmlFor="np-vend">
                      Quem ela é no ERP (dona da fila de orçamentos)
                    </label>
                    <input id="np-vend" className="input" list="vendedores-erp"
                      value={vend} onChange={(e) => setVend(e.target.value)}
                      placeholder="em branco, vê a mesa inteira" />
                    <p className="mt-1 text-sm text-slate-500">
                      Exatamente como o Mubisys escreve: a lista vem de lá.
                    </p>
                    <ModulosDoPainel permissoes={modulos} aoMudar={setModulos} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="area-rodape-fixo flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-sm text-slate-500">
          Uma senha provisória é criada e aparece uma vez, logo depois.
        </p>
        <button type="button" className="btn-ghost" onClick={aoCancelar} disabled={salvando}>Cancelar</button>
        <button className="btn-primary" disabled={salvando}>
          {salvando ? "Criando…" : "Criar e dar acesso"}
        </button>
      </div>
    </form>
  );
}

/* O SETOR DAS PLANILHAS: a régua fina, e a única sub-permissão do painel.
   Três decisões estão desenhadas aqui, e cada uma tem uma cicatriz atrás:

   1. SÓ APARECE NO CARTÃO DE QUEM JÁ EXISTE. O `ModulosDoPainel` é usado
      TAMBÉM no formulário de pessoa nova, e lá o `aoCriar` manda só
      `{permissoes, vendedorId}`: uma caixa de setor marcada ali não viraria
      pedido nenhum. Não seria recusada, não geraria aviso, simplesmente sumia.
      É permutas 19/08 com roupa nova. A guarda é o `usuario`: sem ele, este
      bloco não existe.

   2. SÓ OS SETORES QUE TÊM PLANILHA. São 24 setores cadastrados e hoje 2
      planilhas: mostrar 24 caixas por pessoa é uma tela que ninguém confere.
      E ao lado de cada uma vão os NOMES das planilhas daquele setor: marcar
      "FIN" tem de deixar visível que isso abre a Caixinha.

   3. O ECO MANDA. A tela mostra o que FICOU GRAVADO (o servidor devolve a
      lista relida), não o que foi clicado, e diz o que foi descartado. */
function SetoresDasPlanilhas({ usuario, aoAvisar }) {
  const [meus, setMeus] = useState(null);
  const [setores, setSetores] = useState({});
  const [planilhas, setPlanilhas] = useState({});
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([lerSetoresDaPessoa(usuario), lerSetores(), lerPlanilhas()])
      .then(([m, s, p]) => { if (vivo) { setMeus(m); setSetores(s || {}); setPlanilhas(p || {}); setErro(""); } })
      /* FALHA DE LEITURA TRANCA E GRITA. Devolver lista vazia aqui faria banco
         fora do ar parecer "esta pessoa não tem setor nenhum": zero
         apresentado como resultado, e a gravação seguinte apagaria de verdade. */
      .catch((e) => { if (vivo) { setMeus(null); setErro(e.message); } });
    return () => { vivo = false; };
  }, [usuario]);

  // Só os setores que de fato têm planilha, com os nomes delas ao lado.
  const comPlanilha = useMemo(() => {
    const por = new Map();
    for (const pl of Object.values(planilhas || {})) {
      const k = pl?.setor;
      if (!k) continue;
      if (!por.has(k)) por.set(k, []);
      por.get(k).push(pl.nome || "sem nome");
    }
    return [...por.entries()]
      .map(([id, nomes]) => ({
        id,
        sigla: setores?.[id]?.sigla || id,
        nome: setores?.[id]?.nome || "",
        nomes: nomes.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
      }))
      .sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR", { sensitivity: "base" }));
  }, [planilhas, setores]);

  const totalPlanilhas = Object.keys(planilhas || {}).length;

  async function marcar(id) {
    if (ocupado || meus === null) return;
    const lista = meus.includes(id) ? meus.filter((x) => x !== id) : [...meus, id];
    setOcupado(true);
    try {
      const r = await salvarSetoresDaPessoa(usuario, lista);
      setMeus(r.setores || []);          // o que FICOU, não o que mandei
      if (r.descartados?.length) {
        aoAvisar?.({ tom: "erro", texto: `O servidor não conhece: ${r.descartados.join(", ")}. Esses NÃO foram liberados.` });
      }
    } catch (e) { aoAvisar?.({ tom: "erro", texto: e.message }); }
    finally { setOcupado(false); }
  }

  if (erro) {
    return <p role="alert" className="mt-3 text-sm text-bad-700">Não consegui ler os setores desta pessoa: {erro}</p>;
  }
  if (meus === null) return <p className="mt-3 text-sm text-slate-500" role="status">Carregando os setores…</p>;

  const vistas = comPlanilha.filter((s) => meus.includes(s.id))
    .reduce((n, s) => n + s.nomes.length, 0);

  return (
    <div className="mt-3 rounded-xl border bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">Quais planilhas esta pessoa enxerga</p>
      {!totalPlanilhas ? (
        <p className="mt-1 text-sm text-slate-500">
          Nenhuma planilha cadastrada ainda. Cadastre em <b>Planilhas</b> e o setor dela aparece aqui.
        </p>
      ) : !comPlanilha.length ? (
        <p className="mt-1 text-sm text-slate-500">As planilhas cadastradas ainda não têm setor.</p>
      ) : (
        <>
          <div className="area-grade-modulos mt-1">
            {comPlanilha.map((s) => (
              <label key={s.id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-slate-900">
                <input type="checkbox" checked={meus.includes(s.id)} disabled={ocupado}
                  onChange={() => marcar(s.id)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand focus:ring-brand-200" />
                <span className="min-w-0">
                  {s.sigla}{s.nome ? ` · ${s.nome}` : ""}
                  <span className="block text-xs text-slate-500">{s.nomes.join(" · ")}</span>
                </span>
              </label>
            ))}
          </div>
          {/* CONTAR DOS DOIS LADOS: sem este número, "2 setores marcados" não
              diz quantas planilhas isso abre. */}
          <p className="mt-2 text-xs text-slate-500">
            Hoje enxerga <b>{vistas}</b> de {totalPlanilhas} {totalPlanilhas === 1 ? "planilha" : "planilhas"}.
            {" "}Sem setor marcado, a tela de Planilhas abre vazia.
          </p>
        </>
      )}
      {/* A SEGUNDA TRANCA, dita onde a decisão acontece, e não só lá dentro. */}
      <p className="mt-1 text-xs text-slate-500">
        Isto decide quem <b>acha</b> a planilha no Painel. Quem <b>lê</b> o conteúdo é o Google,
        pelo compartilhamento do próprio documento.
      </p>
    </div>
  );
}

// O que a pessoa enxerga DENTRO do painel. Ficava numa segunda tela, que
// repetia usuario, nome e senha: duas listas de conta na mesma pagina, cada
// uma mandando num pedaco. Agora e aqui, no cartao da propria pessoa.
//
// As descricoes de cada parte ficam atras de um botao (lembrado no aparelho):
// sempre abertas, 16 descricoes de duas linhas faziam do cartao uma parede de
// 2.100px no celular.
function ModulosDoPainel({ permissoes, aoMudar, usuario, aoAvisar }) {
  // Descarta na LEITURA o que nao existe mais (fluxo-caixa, produtos). Sem isto,
  // marcar qualquer caixa reenviaria o id aposentado junto e a tela levaria um
  // aviso de erro por causa de um dado velho que ela mesma carregou.
  const doServidor = somenteValidos(permissoes);

  /* ESTADO LOCAL, senao dois cliques seguidos perdem o primeiro.
     Cada clique montava a lista nova a partir da prop, que so muda quando o
     servidor responde e a lista inteira recarrega. Marcando duas caixas rapido,
     a segunda partia da lista ANTIGA e apagava a primeira, e a tela mostrava
     o resultado errado como se fosse o certo. */
  const [local, setLocal] = useState(null);
  const atuais = local ?? doServidor;
  // Quando o servidor responde, ele passa a mandar de novo.
  useEffect(() => { setLocal(null); }, [permissoes]);

  const [descricoes, setDescricoes] = useState(() => {
    try { return localStorage.getItem("painel_acessos_descricoes") === "1"; } catch { return false; }
  });
  const alternarDescricoes = () => setDescricoes((d) => {
    try { localStorage.setItem("painel_acessos_descricoes", d ? "0" : "1"); } catch { /* aba anonima */ }
    return !d;
  });

  const total = atuais.includes("*");
  const aplicar = (lista) => { setLocal(lista); aoMudar(lista); };
  const marcar = (id) =>
    aplicar(atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]);

  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-3">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
        <input type="checkbox" checked={total}
          onChange={() => aplicar(total ? [] : ["*"])}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand focus:ring-brand-200" />
        <span>
          <b className="font-semibold text-slate-900">Acesso total</b>
          {/* O texto dizia que isto tambem dava para cadastrar e tirar o acesso
              de todo mundo. Nao da, e a promessa era perigosa dos dois lados:
              quem recebia "*" procurava um botao que nao aparecia, e a porta de
              dados chegou a abrir para essa pessoa. Administrar acesso e so da
              conta da direcao. */}
          <span className="block text-sm text-slate-600">
            tudo o que existe <b>dentro do painel</b>, inclusive o que vier depois. Não inclui
            esta tela: cadastrar e tirar acesso continua sendo só da conta da direção.
          </span>
        </span>
      </label>

      {!total && (
        <>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t pt-1">
            <p className="text-xs text-slate-500">
              {atuais.length} de {MODULOS.length} partes marcadas
            </p>
            <button type="button" className="btn-ghost h-10" onClick={alternarDescricoes}>
              {descricoes ? "Esconder as descrições" : "Mostrar o que cada parte mostra"}
            </button>
          </div>
          <div className="area-grade-modulos">
            {MODULOS.map((m) => (
              <label key={m.id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-slate-900">
                <input type="checkbox" checked={atuais.includes(m.id)}
                  onChange={() => marcar(m.id)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand focus:ring-brand-200" />
                <span className="min-w-0">
                  {m.nome}
                  {COM_DINHEIRO.has(m.id) && <span className="chip-warn ml-2 px-2 py-0.5">R$</span>}
                  {descricoes && <span className="block text-sm text-slate-500">{m.sub}</span>}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      <p className="mt-2 text-xs text-slate-500">
        R$ = mostra dinheiro. O que não estiver marcado não aparece no menu nem abre pelo endereço.
      </p>

      {/* `usuario` só chega do cartão de quem JÁ existe: ver o comentário do
          SetoresDasPlanilhas. E vale também para "Acesso total": por decisão do
          dono (15/09/2026) o setor poda todo mundo; só a conta da direção vê
          todas as planilhas. */}
      {usuario && (total || atuais.includes("planilhas")) && (
        <SetoresDasPlanilhas usuario={usuario} aoAvisar={aoAvisar} />
      )}
    </div>
  );
}

/* APONTAR O LOGIN. O campo vem com a lista das contas soltas daquele sistema,
   porque e de la que sai a resposta em quase todo caso: o login existe, so nao
   estava ligado a ninguem. Digitar outro tambem vale: o servidor recusa o que
   nao existe, em vez de criar. */
function TrocarLogin({ sistema, atual, soltas, aoConfirmar, aoFechar }) {
  const [v, setV] = useState(atual || "");
  const [indo, setIndo] = useState(false);
  const idLista = `soltas-${sistema}`;
  return (
    <form
      className="mt-2 w-full rounded-xl bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setIndo(true);
        try { await aoConfirmar(v.trim()); } finally { setIndo(false); }
      }}
    >
      <label className="label" htmlFor={`lg-${sistema}`}>
        Login desta pessoa no {nomeCompletoSis(sistema)}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={`lg-${sistema}`} className="input w-auto min-w-[12rem] flex-1 font-mono text-sm"
          list={idLista} value={v} onChange={(e) => setV(e.target.value)} autoCapitalize="none"
          placeholder="como ela digita para entrar ali" autoFocus />
        <datalist id={idLista}>
          {(soltas || []).map((s) => (
            <option key={s.login} value={s.login}>{s.papel ? rotuloPapel(s.papel) : ""}</option>
          ))}
        </datalist>
        <button className="btn-primary h-10" disabled={indo}>
          {indo ? "Apontando…" : "Apontar"}
        </button>
        <button type="button" className="btn-ghost h-10" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
      {(soltas || []).length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>Sem dono no {nomeCompletoSis(sistema)}:</span>
          {soltas.map((s) => (
            <button key={s.login} type="button" onClick={() => setV(s.login)}
              className="chip-btn min-h-10 px-3 font-mono">
              {s.login}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-sm text-slate-500">
        Isto só acerta o apontamento: não cria nem apaga conta nenhuma. Deixe em branco
        para voltar ao palpite ({sistema === "rh" ? "o nome do colaborador" : "o usuário"}).
      </p>
    </form>
  );
}

// O papel numa linha: select quando ha escolha, texto quando nao ha.
function SelectPapel({ valor, opcoes, aoMudar, rotulo }) {
  const lista = [...new Set([...(opcoes || []), valor].filter(Boolean))];
  return (
    <select className="select h-10 w-full text-sm" value={valor || ""} aria-label={rotulo}
      onChange={(e) => aoMudar(e.target.value)}>
      {lista.map((o) => <option key={o} value={o}>{rotuloPapel(o)}</option>)}
    </select>
  );
}

// O botao "⋯" de uma linha. A bandeja abre logo abaixo da linha.
function BotaoMais({ aberto, aoAlternar, rotulo }) {
  return (
    <button type="button" onClick={aoAlternar} aria-expanded={aberto} aria-label={rotulo} title={rotulo}
      className={`grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 ${aberto ? "bg-slate-100" : ""}`}>
      <MoreHorizontal size={18} aria-hidden="true" />
    </button>
  );
}

/* A BANDEJA DE ACOES DA LINHA. O que apaga ("Tirar o acesso") fica separado
   do resto, no fim e em vermelho: antes "Tirar" (que APAGA a conta no sistema)
   era um botao de 32px igual a "Editar" e "Senha", lado a lado. */
function Bandeja({ children, perigo }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
      {children}
      {perigo && <div className="area-perigo ml-auto">{perigo}</div>}
    </div>
  );
}

/* UMA LINHA pessoa × sistema, no cartao da pessoa. E aqui que a tela deixou de
   mentir: alem do papel, ela mostra COM QUE LOGIN a pessoa entra ali e se
   aquela conta existe. Quando nao existe, os tres caminhos ficam na cara:
   apontar para a conta certa, criar la, ou tirar desta pessoa. */
function LinhaSistema({ c, sis, p, soltas, aoPapel, aoModulos, aoApontar, aoSenha, aoCriarLa, aoTirar, aoVendedor, aoAvisar }) {
  const est = estadoDoPapel(p);
  const [editando, setEditando] = useState(false);
  const [vendendo, setVendendo] = useState(false);
  const [menu, setMenu] = useState(false);
  // Painel sem nenhuma parte: o painel de modulos ABRE SOZINHO, porque a saida
  // e justamente marcar as partes.
  const [modulosAbertos, setModulosAbertos] = useState(est.chave === "vazia");
  useEffect(() => { if (est.chave === "vazia") setModulosAbertos(true); }, [est.chave]);

  const existe = !!p.real?.existe;
  const soLeitura = !!doSistema(sis).soLeitura;
  const opcoes = PAPEIS[sis] || [];
  const nome = c.nome || c.usuario;
  const sisNome = nomeCompletoSis(sis);
  const perms = somenteValidos(p.real?.permissoes || p.permissoes);
  const papelAtual = p.real?.papel || p.papel || "";

  return (
    <LinhaLista tom={est.tom}>
      <div className="area-linha-sistema">
        <div className="c-sis flex min-w-0 items-center gap-2">
          <IconeDoSistema sistema={sis} className="shrink-0 text-slate-500" />
          <span className="min-w-0 text-sm font-semibold text-slate-900">{sisNome}</span>
        </div>
        {/* O LOGIN. Antes nao aparecia em lugar nenhum, e era ele que estava
            errado. */}
        <div className="c-entra flex min-w-0 items-center gap-1">
          <span className="c-entra-rotulo shrink-0 text-xs text-slate-500">Entra como</span>
          <button type="button" onClick={() => setEditando((x) => !x)}
            aria-label={`Trocar o login de ${nome} no ${sisNome}`} title="Trocar o login"
            className="inline-flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg px-2 font-mono text-sm text-slate-800 hover:bg-slate-100">
            <span className="min-w-0 break-all text-left">{p.login || "sem login"}</span>
            <Pencil size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
          </button>
        </div>
        <div className="c-situacao">
          <Selo tom={est.tom}>{PALAVRA_DO_ESTADO[est.chave] || est.rotulo}</Selo>
        </div>
        <div className="c-papel min-w-0">
          {sis === "painel" && existe ? (
            <button type="button" className="btn-outline h-10 w-full justify-between"
              aria-expanded={modulosAbertos} onClick={() => setModulosAbertos((x) => !x)}>
              <span className="truncate">
                {perms.includes("*") ? "acesso total" : perms.length ? `${perms.length} de ${MODULOS.length} partes` : "nenhuma parte"}
              </span>
              <ChevronDown size={16} aria-hidden="true" className={`shrink-0 transition-transform ${modulosAbertos ? "rotate-180" : ""}`} />
            </button>
          ) : existe && opcoes.length > 1 && !soLeitura ? (
            <SelectPapel valor={papelAtual} opcoes={opcoes} rotulo={`Papel de ${nome} no ${sisNome}`}
              aoMudar={(v) => aoPapel(sis, v)} />
          ) : existe && papelAtual ? (
            <span className="text-sm text-slate-600">{rotuloPapel(papelAtual)}</span>
          ) : null}
        </div>
        <div className="c-menu justify-self-end">
          <BotaoMais aberto={menu} aoAlternar={() => setMenu((x) => !x)} rotulo={`Mais ações no ${sisNome}`} />
        </div>
      </div>

      {/* QUEM ELA É NO ERP. Sem isto a pessoa abre a mesa do time inteiro
          em vez da própria fila, e sem aviso nenhum, porque uma lista
          cheia parece certa. Ficou 149 orçamentos assim com a Michelle.
          O nome tem de ser EXATO como o Mubisys escreve: a comparação só
          junta espaço, não normaliza acento nem sobrenome. */}
      {sis === "painel" && existe && !vendendo && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
          {p.vendedor_id
            ? <span className="text-slate-600">Fila de orçamentos: {p.vendedor_id}</span>
            : <span className="text-warn-700">Fila de orçamentos: todos (sem vendedor)</span>}
          <button type="button" className="btn-ghost h-10 px-3" onClick={() => setVendendo(true)}>Mudar</button>
        </div>
      )}

      {/* A DIVERGENCIA, escrita por extenso e com saida. Selo vermelho sem
          caminho e so uma forma mais bonita de nao resolver. */}
      {!existe && !editando && (
        <div className="mt-2 rounded-xl bg-bad-50 p-3 text-sm text-bad-700">
          <p>
            Esta tela diz que {nome} entra no {sisNome} como{" "}
            <b className="font-mono">{p.login}</b>, e não existe conta com esse login lá.
            Enquanto ficar assim, a senha dela <b>não chega ao {sisNome}</b>.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-outline h-10" onClick={() => setEditando(true)}>
              <Link2 size={16} aria-hidden="true" /> Apontar para a conta certa
            </button>
            {!soLeitura && (
              <button type="button" className="btn-ghost h-10" onClick={() => aoCriarLa(sis)}>
                <Plus size={16} aria-hidden="true" /> Criar a conta lá
              </button>
            )}
            <button type="button" className="btn-ghost h-10 text-bad-700 hover:bg-bad-50" onClick={() => aoTirar(sis)}>
              <X size={16} aria-hidden="true" /> Tirar desta pessoa
            </button>
          </div>
        </div>
      )}

      {/* EXISTE E NAO ABRE NADA. Sem isto o cartao mostra o selo verde de
          "conta ok" numa linha que nao da acesso a coisa nenhuma, e a pessoa
          reclama que "o painel nao abre" enquanto a tela jura que esta tudo
          certo. A saida e a mesma que ja existe: liberar as partes. */}
      {est.chave === "vazia" && !editando && (
        <div className="mt-2 rounded-xl bg-bad-50 p-3 text-sm text-bad-700">
          <p>
            {nome} entra no Painel com a senha certa e vê uma tela vazia: nenhuma parte foi
            liberada. Como não é erro de login, o que chega até você é “o painel não abre”.
          </p>
          <p className="mt-1 font-semibold">Marque as partes logo abaixo, ou tire o acesso ao Painel.</p>
          <div className="mt-2">
            <button type="button" className="btn-ghost h-10 text-bad-700 hover:bg-bad-50" onClick={() => aoTirar(sis)}>
              <X size={16} aria-hidden="true" /> Tirar o acesso ao Painel
            </button>
          </div>
        </div>
      )}

      {menu && (
        <Bandeja perigo={(
          <button type="button" className="btn-ghost h-10 text-bad-700 hover:bg-bad-50" onClick={() => aoTirar(sis)}>
            <X size={16} aria-hidden="true" /> Tirar o acesso ao {sisNome}
          </button>
        )}>
          {/* A Central tem porta propria (leo-sync) e nao se administra por
              aqui: o botao chamaria a equipe-auth, que fabricaria uma segunda
              senha valida para o app pessoal do dono. O servidor recusa; o
              botao some para nao prometer. Pelo mesmo motivo some para a
              propria direcao e para quem esta desativado (o servidor recusa os
              dois; `aoSenha` chega vazio do cartao). */}
          {existe && !soLeitura && aoSenha && (
            <button type="button" className="btn-ghost h-10" onClick={() => aoSenha(sis)}>
              <KeyRound size={16} aria-hidden="true" /> Senha nova só no {sisNome}
            </button>
          )}
          <button type="button" className="btn-ghost h-10" onClick={() => { setEditando(true); setMenu(false); }}>
            <AtSign size={16} aria-hidden="true" /> Trocar o login
          </button>
        </Bandeja>
      )}

      {editando && (
        <TrocarLogin
          sistema={sis} atual={p.login} soltas={soltas}
          aoFechar={() => setEditando(false)}
          aoConfirmar={async (login) => {
            const ok = await aoApontar(sis, login);
            if (ok) setEditando(false);
          }}
        />
      )}

      {vendendo && sis === "painel" && (
        <form
          className="mt-2 w-full rounded-xl bg-slate-50 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("vend");
            if (await aoVendedor(String(v || "").trim())) setVendendo(false);
          }}
        >
          <label className="label" htmlFor={`vd-${c.usuario}`}>
            Quem esta pessoa é no ERP (dona da fila de orçamentos)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input id={`vd-${c.usuario}`} name="vend" className="input w-auto min-w-[12rem] flex-1"
              list="vendedores-erp" defaultValue={p.vendedor_id || ""} autoFocus
              placeholder="em branco, vê a mesa inteira" />
            <button className="btn-primary h-10">Salvar</button>
            <button type="button" className="btn-ghost h-10" onClick={() => setVendendo(false)}>
              Cancelar
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Tem de ser <b>exatamente</b> como o Mubisys escreve: a lista acima vem de lá, com
            quantos orçamentos cada nome tem. Em branco, a pessoa passa a ver os orçamentos de
            todo mundo.
          </p>
        </form>
      )}

      {sis === "painel" && existe && modulosAbertos && (
        <ModulosDoPainel
          permissoes={p.real.permissoes || p.permissoes || []}
          aoMudar={(novas) => aoModulos(novas)}
          usuario={c.usuario}
          aoAvisar={aoAvisar}
        />
      )}
    </LinhaLista>
  );
}

/* DAR ACESSO A OUTRO SISTEMA. Substitui a caixa de marcar de cada sistema,
   que CRIAVA conta ao marcar e APAGAVA ao desmarcar: uma caixa e o controle
   mais facil de mexer sem querer. "Dar acesso" e "Tirar o acesso" dizem o
   efeito no proprio nome, e as confirmacoes continuam as mesmas. */
function DarAcesso({ faltam, aoDar }) {
  const [aberto, setAberto] = useState(false);
  const [dando, setDando] = useState("");
  if (!faltam.length) return null;
  return (
    <div className="border-t">
      <button type="button" onClick={() => setAberto((x) => !x)} aria-expanded={aberto}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-medium text-brand-700 hover:bg-brand-50">
        <Plus size={16} aria-hidden="true" /> Dar acesso a outro sistema
        <ChevronDown size={16} aria-hidden="true" className={`ml-auto transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <ul className="area-linhas border-t">
          {faltam.map((sis) => (
            <li key={sis} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
              <IconeDoSistema sistema={sis} className="shrink-0 text-slate-500" />
              {/* Nome em cima e papel embaixo: lado a lado, no celular o botao
                  pulava para a linha de baixo so em alguns sistemas. */}
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-slate-900">{nomeCompletoSis(sis)}</span>
                {PAPEL_INICIAL[sis] && (
                  <span className="block text-xs text-slate-500">entra como {rotuloPapel(PAPEL_INICIAL[sis])}</span>
                )}
              </span>
              <button type="button" className="btn-outline h-10 shrink-0" disabled={!!dando}
                onClick={async () => { setDando(sis); try { await aoDar(sis); } finally { setDando(""); } }}>
                {dando === sis ? "Dando acesso…" : "Dar acesso"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* O CARTAO DA PESSOA. Fechado, ja diz o que importa: os sistemas dela e UM
   selo (pendencia, desativada ou senha provisoria). Aberto, mostra so os
   sistemas em que ela entra: os outros ficam atras de "Dar acesso a outro
   sistema". Antes eram nove linhas, oito delas vazias. */
function Conta({ c, sistemas, soltas, acoes, aoMudar, aoAvisar, aoSenha, aoDefinirSenha, souEu, abertaInicial }) {
  const [aberta, setAberta] = useState(!!abertaInicial);
  const [f, setF] = useState(null);
  const caixa = useRef(null);
  useEffect(() => {
    if (!abertaInicial) return;
    setAberta(true);
    requestAnimationFrame(() => caixa.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [abertaInicial]);

  const nome = c.nome || c.usuario;
  const ehFuncao = c.tipo === "funcao";

  const editar = () => {
    // `ativo` viaja junto: sem ele o servidor recebe undefined, assume true e
    // salvar o NOME de alguem desativado devolvia o acesso dela, calado.
    setF({ usuario: c.usuario, nome: c.nome || "", tipo: c.tipo,
           colaborador: c.colaborador || "", ativo: c.ativo !== false });
  };

  const gravar = async (e) => {
    e.preventDefault();
    try {
      await salvarConta(f);
      setF(null);
      aoAvisar({ tom: "ok", texto: `Dados de ${f.nome || f.usuario} salvos.` });
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  // Dar acesso E criar la: aqui criar e o que se pediu.
  const darAcesso = async (sis) => {
    try {
      const r = await salvarPapel(
        { usuario: c.usuario, sistema: sis, papel: PAPEL_INICIAL[sis] ?? "" },
        { criar: true });
      // Conta nova naquele sistema nasce com senha provisoria. Se ela nao
      // aparecer aqui, ninguem nunca a vera, e a pessoa nao entra.
      if (r?.senha) {
        aoSenha({
          titulo: `Acesso ao ${nomeCompletoSis(sis)}`, nome, sistemaNome: nomeCompletoSis(sis),
          senha: r.senha, login: r.login || c.usuario, provisoria: provisoriaNoSistema(sis),
        });
      } else {
        aoAvisar({ tom: "ok", texto: `${nome} agora entra no ${nomeCompletoSis(sis)}.` });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const trocarModulos = async (permissoes) => {
    if (permissoes.includes("*") &&
        !confirm(`Dar ACESSO TOTAL a ${nome}?\n\nEla passa a ver TUDO dentro do Painel, inclusive dinheiro: contas a pagar, fluxo, margem por orçamento e a tela de Gestão.\n\nNão inclui esta tela: cadastrar e tirar acesso continua só na conta da direção.`)) {
      return;
    }
    try {
      const r = await salvarPapel({ usuario: c.usuario, sistema: "painel", papel: "", permissoes });
      /* CONFIRMA O EFEITO, e nao a ausencia de erro.
         O servidor devolve em `descartados` o modulo que ele nao conhece: a
         caixa fica marcada e a pessoa nao ganha nada. Isso aconteceu com
         `permutas` em 19/08/2026 e custou dois dias de procura na tela errada.
         Agora a tela DIZ, nos dois sentidos: o que entrou e o que foi recusado. */
      if (r?.aviso) {
        aoAvisar({ tom: "erro", texto: r.aviso });
      } else {
        aoAvisar({
          tom: "ok",
          texto: permissoes.includes("*")
            ? `${nome} agora tem acesso total ao painel.`
            : `Acesso de ${nome} salvo: ${permissoes.length} ${permissoes.length === 1 ? "parte" : "partes"} do painel.`,
        });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const criarLa = async (sis) => {
    const p = c.papeis.find((x) => x.sistema === sis);
    const sisNome = nomeCompletoSis(sis);
    /* O PAPEL MARCADO NUMA LINHA QUE NUNCA EXISTIU NAO E DECISAO DE NINGUEM.
       Ate 17/08/2026 este botao obedecia a `p.papel` cegamente, e a
       consolidacao de 05/08 tinha marcado ADMIN em 8 linhas do Compras e 7 do
       POPs que nunca foram concedidas por ninguem (o log nao tem uma unica
       criacao delas). Um clique aqui em cada uma faria oito pessoas aprovarem
       ordem de compra.
       Entao: papel de comando numa conta que nao existe cai para o de operacao,
       e o aviso DIZ isso. Promover depois e um seletor nesta mesma linha. */
    const { papel, marcado, rebaixado } = papelAoCriar(sis, p?.papel);
    const recado = rebaixado
      ? `Criar a conta "${p?.login}" no ${sisNome} como ${papel}?\n\n`
        + `Esta tela marca "${marcado}", que é o papel de comando do ${sisNome}. `
        + `Mas essa marcação nunca virou conta, então ela não veio de uma decisão registrada.\n\n`
        + `A conta será criada no papel de trabalho (${papel}). Se ${nome} precisar mandar lá dentro, `
        + `troque o papel nesta mesma linha depois.`
      : `Criar a conta "${p?.login}" no ${sisNome}${papel ? ` como ${papel}` : ""}?\n\n`
        + `Só faça isso se ${nome} REALMENTE não tem conta lá. Se tiver com outro nome, `
        + `use "Apontar para a conta certa", senão ficam duas.`;
    /* CRIAR PAINEL SEM MODULO E CRIAR UMA PORTA PARA UMA SALA VAZIA. O papel
       nao manda no Painel (quem manda e a lista de partes), entao esta
       criacao termina com a pessoa entrando e vendo tela em branco. Dizer isso
       ANTES vale mais do que acusar depois: depois, quem reclama e ela. */
    const painelSemParte =
      sis === "painel" && !(p?.real?.permissoes?.length || p?.permissoes?.length);
    const aviso = painelSemParte
      ? "\n\nATENÇÃO: nenhuma parte do Painel está marcada para ela. Do jeito que está, "
        + "ela entra e vê uma tela vazia. Depois de criar, marque as partes na mesma linha."
      : "";
    if (!confirm(recado + aviso)) return;
    try {
      const r = await salvarPapel(
        { usuario: c.usuario, sistema: sis, papel },
        { criar: true });
      if (r?.senha) {
        aoSenha({
          titulo: `Conta criada no ${sisNome}`, nome, sistemaNome: sisNome,
          senha: r.senha, login: r.login || p?.login, provisoria: provisoriaNoSistema(sis),
        });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const trocarVendedor = async (vendedorId) => {
    try {
      await salvarPapel({ usuario: c.usuario, sistema: "painel", papel: "", vendedorId });
      aoAvisar({
        tom: "ok",
        texto: vendedorId
          ? `${nome} passa a ver a fila de "${vendedorId}".`
          : `${nome} passa a ver os orçamentos de todo mundo.`,
      });
      await aoMudar();
      return true;
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); return false; }
  };

  const alternarAtivo = async () => {
    const ligar = c.ativo === false;
    if (!ligar && !confirm(`Desativar ${nome}? Ela para de entrar. Quem já está com a sessão aberta continua até o crachá vencer.`)) return;
    try {
      const r = await desativar(c.usuario, ligar);
      if (r.recusados?.length) {
        aoAvisar({ tom: "erro", texto: r.recusados.map((x) => `${nomeCompletoSis(x.sistema)}: ${x.erro}`).join(" · ") });
      } else {
        aoAvisar({ tom: "ok", texto: ligar ? `${nome} foi reativada.` : `${nome} foi desativada.` });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const papeis = [...c.papeis].sort((a, b) => porOrdem(a.sistema, b.sistema));
  const temSistema = new Set(papeis.map((p) => p.sistema));
  const faltam = [...sistemas].sort(porOrdem).filter((s) => !temSistema.has(s) && !ehExterna(s));
  const naoMigradas = c.senhas.filter((s) => !s.migrada).length;
  // O numero que faz abrir o cartao. Sem ele a divergencia so aparecia para
  // quem ja tivesse aberto, ou seja, para ninguem. Conta tambem o Painel que
  // existe e nao abre nada: e a mesma "pendencia" do recorte e da Visao geral.
  const pendentes = c.papeis.filter(temPendencia).length;
  const selo = pendentes ? { tom: "bad", texto: `${pendentes} com pendência` }
    : c.ativo === false ? { tom: "neutral", texto: "desativada" }
      // A mesma regra da contagem e do recorte (temSenhaProvisoria).
      : temSenhaProvisoria(c) ? { tom: "warn", texto: "senha provisória" }
        : null;
  const linha2 = (ehFuncao ? "Porta compartilhada · " : "")
    + (papeis.length ? papeis.map((p) => nomeCompletoSis(p.sistema)).join(" · ") : "sem nenhum sistema");

  return (
    <div ref={caixa} className="scroll-mt-20 rounded-xl border bg-white">
      <button type="button" onClick={() => setAberta((a) => !a)} aria-expanded={aberta}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-slate-50">
        {ehFuncao ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn-50 text-warn-700" title="Porta compartilhada">
            <DoorOpen size={16} aria-hidden="true" />
          </span>
        ) : (
          <Avatar nome={nomeDoAvatar(nome)} tamanho="h-9 w-9 text-xs" />
        )}
        <span className="min-w-0 flex-1">
          <span className="area-quebra-estreito block truncate">
            <span className="mr-2 text-sm font-semibold text-slate-900">{nome}</span>
            <span className="font-mono text-xs text-slate-500">{c.usuario}</span>
          </span>
          {/* No celular o selo desce para a segunda linha: ao lado do nome ele
              cortava o nome da pessoa. E ali as linhas quebram em vez de cortar:
              com o selo do lado, sobravam 130px e os sistemas viravam
              "Painel de Gestão · P...". */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {selo && <span className="area-so-estreito-720 shrink-0"><Selo tom={selo.tom}>{selo.texto}</Selo></span>}
            <span className="area-quebra-estreito min-w-0 truncate text-xs text-slate-500">{linha2}</span>
          </span>
        </span>
        {selo && <span className="area-esconde-estreito shrink-0"><Selo tom={selo.tom}>{selo.texto}</Selo></span>}
        <ChevronDown size={18} aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>

      {aberta && (
        <div className="area-cartao-corpo space-y-4 border-t">
          {c.ativo === false && <Aviso tom="info">Desativada: não entra em nenhum sistema.</Aviso>}
          <p className="text-sm text-slate-600">
            Usuário <span className="font-mono">{c.usuario}</span>
            {" · "}{c.colaborador ? `Ficha no RH: ${c.colaborador}` : "sem ficha no RH"}
            {ehFuncao ? " · Porta compartilhada" : ""}
          </p>

          <div className="flex flex-wrap items-start gap-2">
            {/* A CONTA DA DIRECAO se troca em Minha conta: e ela a dona do
                painel, e definir a propria senha por aqui seria um caminho sem
                saida (o servidor recusa: "A sua propria senha se troca em Minha
                conta"). Entao a tela desvia, em vez de oferecer o botao. */}
            {souEu ? (
              <Link to="/minha-conta" className="btn-ghost h-10">
                <KeyRound size={16} aria-hidden="true" /> A sua senha se troca em Minha conta
              </Link>
            ) : (
              <div>
                <button type="button" className="btn-outline"
                  disabled={c.ativo === false || !c.papeis.length}
                  onClick={() => aoDefinirSenha(c)}>
                  <KeyRound size={16} aria-hidden="true" /> Definir senha para todos os sistemas
                </button>
                {c.ativo === false ? <p className="mt-1 text-xs text-slate-500">Reative para definir uma senha.</p>
                  : !c.papeis.length ? <p className="mt-1 text-xs text-slate-500">Dê acesso a um sistema antes.</p> : null}
              </div>
            )}
            {!f && (
              <button type="button" className="btn-ghost" onClick={editar}>
                <Pencil size={16} aria-hidden="true" /> Editar nome e ficha do RH
              </button>
            )}
          </div>

          {f && (
            <form onSubmit={gravar} className="space-y-3 rounded-xl border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`n-${c.usuario}`}>Nome</label>
                  <input id={`n-${c.usuario}`} className="input" value={f.nome}
                    onChange={(e) => setF((x) => ({ ...x, nome: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor={`t-${c.usuario}`}>O que é esta conta</label>
                  <select id={`t-${c.usuario}`} className="select" value={f.tipo}
                    onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}>
                    <option value="pessoa">Uma pessoa</option>
                    <option value="funcao">Porta compartilhada (uma função)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`c-${c.usuario}`}>Quem é no RH (opcional)</label>
                  <input id={`c-${c.usuario}`} className="input" list="rh-colaboradores"
                    value={f.colaborador} placeholder="escolha na lista do cadastro"
                    onChange={(e) => setF((x) => ({ ...x, colaborador: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary">Salvar</button>
                <button type="button" className="btn-ghost" onClick={() => setF(null)}>Cancelar</button>
              </div>
            </form>
          )}

          <div>
            <p className="mb-2 flex items-baseline gap-2">
              <span className="label mb-0">Sistemas</span>
              <span className="text-xs text-slate-500">{papeis.length} de {sistemas.length}</span>
            </p>
            <div className="area-lista-sistemas">
              {papeis.length > 0 && (
                <div className="area-colunas-sistema px-4 pt-2 text-xs text-slate-500" aria-hidden="true">
                  <span>Sistema</span><span>Entra como</span><span>Situação</span><span>Papel</span><span />
                </div>
              )}
              <div className="area-margem-estreita">
                {papeis.map((p) => (
                  <LinhaSistema
                    key={p.sistema} c={c} sis={p.sistema} p={p}
                    soltas={soltas?.[p.sistema]}
                    aoPapel={(sis, papel) => acoes.papel(c.usuario, sis, papel)}
                    aoModulos={trocarModulos}
                    aoApontar={(sis, login) => acoes.apontar(c.usuario, nome, sis, login)}
                    aoSenha={souEu || c.ativo === false ? null : (sis) => acoes.senha(c.usuario, nome, sis)}
                    aoCriarLa={criarLa}
                    aoTirar={(sis) => acoes.tirar(c.usuario, nome, sis)}
                    aoVendedor={trocarVendedor}
                    aoAvisar={aoAvisar}
                  />
                ))}
              </div>
              {!papeis.length && (
                <p className="px-4 py-3 text-sm text-slate-500">{nome} ainda não entra em nenhum sistema.</p>
              )}
              <div className="area-margem-estreita">
                <DarAcesso faltam={faltam} aoDar={darAcesso} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-slate-500">
              {c.senhas.length > 0 && (naoMigradas === c.senhas.length
                ? `Guardadas ${c.senhas.length === 1 ? "a senha atual" : `as ${c.senhas.length} senhas atuais`} desta pessoa. Na virada ela entra com qualquer uma delas e essa vira a única.`
                : `${c.senhas.length - naoMigradas} de ${c.senhas.length} já migraram.`)}
            </p>
            {c.ativo === false ? (
              <button type="button" className="btn-outline h-10" onClick={alternarAtivo}>
                <Power size={16} aria-hidden="true" /> Reativar esta pessoa
              </button>
            ) : (
              <button type="button" className="btn-ghost h-10 text-bad-700 hover:bg-bad-50" onClick={alternarAtivo}>
                <Power size={16} aria-hidden="true" /> Desativar esta pessoa
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* DEFINIR SENHA PARA TODOS OS SISTEMAS DE UMA PESSOA (contrato B).
   Uma pessoa por clique, e so: nao existe botao "todos", e a chamada
   `definirSenha(` mora num lugar so de src/ (este), com UM usuario. O servidor
   garante o mesmo do lado dele (freio de lote, corpo com um usuario so).

   O `confirm()` de antes virou esta janela, com o mesmo aviso: a senha atual
   para de valer em TODOS, inclusive na entrada pelo Painel, que e a porta que a
   equipe usa. E agora ela diz ANTES onde a senha vai valer, e DEPOIS onde valeu. */
export function JanelaDefinirSenha({ c, aoFechar }) {
  const nome = c.nome || c.usuario;
  const [modo, setModo] = useState("gerar");
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resposta, setResposta] = useState(null);
  const campo = useRef(null);
  const previsao = useMemo(() => previsaoDaSenha(c), [c]);
  const regras = conferirSenha(nova, { repetida });
  // Fechou: a senha sai do estado da tela (a janela desmonta). Nada vai para
  // localStorage, endereco ou log.
  const { pedirFechar, guarda } = useGuardaDaSenha(() => aoFechar(resposta));

  async function enviar(e) {
    e.preventDefault();
    const pedido = prepararDefinicao({ modo, nova, repetida });
    if (!pedido.ok) {
      // Regra furada nao envia NADA: marca de vermelho e volta ao campo.
      setTentou(true);
      campo.current?.focus();
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const r = await definirSenha(c.usuario, pedido.senha);
      setResposta({ ...r, senha: r?.senha || pedido.senha || "" });
      setNova("");
      setRepetida("");
    } catch (err) {
      // Em erro a senha NAO aparece: se nada mudou, ela nao vale em lugar nenhum.
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const porta = c.tipo === "funcao";
  return (
    <JanelaFormulario titulo={`Definir senha de ${nome}`} classe="janela-estreita" ocupado={enviando}
      aoFechar={resposta ? pedirFechar : () => aoFechar(null)}>
      {resposta ? (
        <ConteudoSenha
          nome={nome}
          senha={resposta.senha}
          login={c.usuario}
          provisoria={typeof resposta.temporaria === "boolean" ? resposta.temporaria : !porta}
          porta={porta}
          manchete={mancheteDaSenha(resposta, { modo: "definir", nome })}
          itens={resultadoDaSenha(resposta, { modo: "definir" })}
          {...guarda}
        />
      ) : (
        <form onSubmit={enviar} noValidate className="space-y-4">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <p className="text-sm text-slate-600">Uma senha só, para todos os sistemas dela.</p>
          <ResultadoSenhas itens={previsao} titulo="Vai valer em" />
          <fieldset>
            <legend className="label">Qual senha</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
              <input type="radio" name="qual-senha" value="gerar" checked={modo === "gerar"}
                onChange={() => setModo("gerar")} className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <span>
                <span className="block text-sm font-medium text-slate-900">Gerar uma senha</span>
                <span className="block text-xs text-slate-500">Quatro palavras e três números, fácil de ditar.</span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
              <input type="radio" name="qual-senha" value="escolher" checked={modo === "escolher"}
                onChange={() => setModo("escolher")} className="h-5 w-5 shrink-0 text-brand" />
              <span className="text-sm font-medium text-slate-900">Eu escolho</span>
            </label>
          </fieldset>
          {modo === "escolher" && (
            <div className="space-y-3">
              <div>
                <CampoSenha id="ds-nova" rotulo="Senha nova" valor={nova} aoMudar={setNova}
                  autoComplete="new-password" entradaRef={campo} descrito="ds-regras"
                  invalido={tentou && regras.some((r) => r.id !== "iguais" && !r.ok)} />
                <RegrasDaSenha id="ds-regras" regras={regras.filter((r) => r.id !== "iguais")} tentou={tentou} vazio={!nova} />
              </div>
              <div>
                <CampoSenha id="ds-repetida" rotulo="Repita a senha" valor={repetida} aoMudar={setRepetida}
                  autoComplete="new-password" descrito="ds-iguais"
                  invalido={tentou && !regras.find((r) => r.id === "iguais")?.ok} />
                <RegrasDaSenha id="ds-iguais" regras={regras.filter((r) => r.id === "iguais")} tentou={tentou} vazio={!repetida} />
              </div>
            </div>
          )}
          <Aviso tom="aviso">
            A senha atual de {nome} para de valer em todos os sistemas, inclusive no RH e na entrada
            pelo Painel, que é a porta que a equipe usa.
          </Aviso>
          <Aviso tom="info">{avisoDeTroca(c)}</Aviso>
          <div className="area-rodape-fixo flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => aoFechar(null)} disabled={enviando}>Cancelar</button>
            <button className="btn-primary" disabled={enviando}>
              <KeyRound size={16} aria-hidden="true" />
              {enviando ? "Definindo…" : "Definir senha"}
            </button>
          </div>
        </form>
      )}
    </JanelaFormulario>
  );
}

/* Editar a pessoa sem sair da lista do sistema. Nasceu de "aqui tem que ter o
   botao de editar tb": o dono via `thiago` e `montagem` como nome de gente e
   tinha de ir para a outra aba so para arrumar. */
function EditarNaLinha({ conta, sistema, login, soltas, aoSalvar, aoFechar }) {
  const [nome, setNome] = useState(conta.nome || conta.usuario);
  const [lg, setLg] = useState(login || "");
  const [indo, setIndo] = useState(false);
  const idLista = `soltas-linha-${sistema}`;
  const sisNome = nomeCompletoSis(sistema);
  return (
    <form
      className="mt-2 w-full rounded-xl bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setIndo(true);
        try {
          const ok = await aoSalvar({
            nome: nome.trim() || conta.usuario,
            ...(lg.trim() === (login || "") ? {} : { login: lg.trim() }),
          });
          if (ok) aoFechar();
        } finally { setIndo(false); }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`ed-n-${sistema}-${conta.usuario}`}>
            Nome da pessoa
          </label>
          <input id={`ed-n-${sistema}-${conta.usuario}`} className="input"
            value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          <p className="mt-1 text-sm text-slate-500">
            É o nome que aparece dentro do {sisNome} e assina o que a pessoa faz lá.
            Vale para todos os sistemas dela.
          </p>
        </div>
        <div>
          <label className="label" htmlFor={`ed-l-${sistema}-${conta.usuario}`}>
            Login no {sisNome}
          </label>
          <input id={`ed-l-${sistema}-${conta.usuario}`} className="input font-mono text-sm"
            list={idLista} value={lg} onChange={(e) => setLg(e.target.value)} autoCapitalize="none" />
          <datalist id={idLista}>
            {(soltas || []).map((s) => <option key={s.login} value={s.login} />)}
          </datalist>
          <p className="mt-1 text-sm text-slate-500">
            Só aponta para uma conta que já existe lá: não cria nem renomeia nada.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary h-10" disabled={indo}>
          {indo ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="btn-ghost h-10" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* UMA CONTA dentro da secao de um sistema. EDITAR DAQUI MESMO: antes esta lista
   so mostrava; o dono abria o PCP, via os nomes e tinha de ir para a outra aba,
   achar a pessoa e abrir o cartao dela para mexer em uma coisa que ja estava na
   frente dele. Sao as MESMAS acoes da outra aba (`acoes`), nao uma segunda
   copia das regras. */
function LinhaContaSistema({ l, sistema, acoes, soltas }) {
  const [editando, setEditando] = useState(false);
  const [menu, setMenu] = useState(false);
  const sisNome = nomeCompletoSis(sistema);
  const soLeitura = !!doSistema(sistema).soLeitura;
  const opcoes = PAPEIS[sistema] || [];
  const nomeDono = l.dono ? l.dono.nome || l.dono.usuario : "";
  // O selo so aparece quando ha algo a dizer: numa lista de dezenas de contas,
  // verde em toda linha apaga o sinal das que pedem acao.
  const estado = l.estado && l.estado !== "ok" ? l.estado : "";
  const podeMexer = !!l.dono && !soLeitura;

  return (
    <LinhaLista tom={l.tom}>
      <div className="area-linha-conta">
        <span className="c-login min-w-0 break-all font-mono text-sm font-semibold text-slate-900">{l.login}</span>
        <span className="c-pessoa min-w-0 break-words text-sm text-slate-600">
          {l.dono ? nomeDono : (
            <span className="text-warn-700">
              sem dono aqui{l.nome && l.nome !== l.login ? ` · lá está como "${l.nome}"` : ""}
            </span>
          )}
        </span>
        <span className="c-situacao">
          {estado && <Selo tom={TOM_DO_ESTADO[estado] || "neutral"}>{PALAVRA_DO_ESTADO[estado]}</Selo>}
        </span>
        <span className="c-papel min-w-0">
          {l.papel && opcoes.length > 1 && l.dono ? (
            <SelectPapel valor={l.papel} opcoes={opcoes} rotulo={`Papel de ${nomeDono} no ${sisNome}`}
              aoMudar={(v) => acoes.papel(l.dono.usuario, sistema, v)} />
          ) : l.papel ? (
            <span className="chip">{rotuloPapel(l.papel)}</span>
          ) : null}
        </span>
        <span className="c-acoes flex items-center justify-end gap-1">
          {podeMexer && (
            <>
              <button type="button" className="btn-ghost h-10 px-3" onClick={() => setEditando((x) => !x)}
                aria-expanded={editando}>
                <Pencil size={16} aria-hidden="true" /> Editar
              </button>
              <BotaoMais aberto={menu} aoAlternar={() => setMenu((x) => !x)} rotulo={`Mais ações para ${l.login}`} />
            </>
          )}
        </span>
      </div>
      {podeMexer && menu && (
        <Bandeja perigo={(
          <button type="button" className="btn-ghost h-10 text-bad-700 hover:bg-bad-50"
            onClick={() => acoes.tirar(l.dono.usuario, nomeDono, sistema)}>
            <X size={16} aria-hidden="true" /> Tirar o acesso ao {sisNome}
          </button>
        )}>
          {/* Pessoa desativada: o servidor recusa a senha (reative antes). */}
          {l.dono.ativo !== false && (
            <button type="button" className="btn-ghost h-10"
              onClick={() => acoes.senha(l.dono.usuario, nomeDono, sistema)}>
              <KeyRound size={16} aria-hidden="true" /> Senha nova só no {sisNome}
            </button>
          )}
        </Bandeja>
      )}
      {l.dono && editando && (
        <EditarNaLinha
          conta={l.dono} sistema={sistema} login={l.login}
          soltas={soltas?.[sistema]}
          aoFechar={() => setEditando(false)}
          aoSalvar={(campos) => acoes.editar(l.dono, sistema, { ...campos, papel: l.papel })}
        />
      )}
    </LinhaLista>
  );
}

/* UMA SECAO POR SISTEMA, que abre e fecha. Fechada, ela ja diz o essencial:
   quantas pessoas entram ali e UM selo, o mais grave. Aberta, mostra nome por
   nome.

   Fechadas por padrao de proposito: oito listas abertas de uma vez sao uma
   parede de nomes, e a pergunta que se faz aqui e sempre sobre UM sistema. */
function SecaoSistema({ sistema, fonte, dados, acoes, soltas, aberta, aoAlternar, realce, secaoRef }) {
  const sisNome = nomeCompletoSis(sistema);
  const reg = doSistema(sistema);
  if (ehExterna(sistema, fonte)) {
    return (
      <div ref={secaoRef} className="flex min-h-14 flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-2">
        <IconeDoSistema sistema={sistema} className="shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{sisNome}</p>
          <p className="text-sm text-slate-500">Acessos administrados no próprio sistema.</p>
        </div>
        <Selo tom="neutral">gestão externa</Selo>
        {reg.url && (
          <a href={reg.url} target="_blank" rel="noreferrer" className="btn-ghost h-10">
            Abrir <ExternalLink size={16} aria-hidden="true" />
          </a>
        )}
      </div>
    );
  }
  const selo = seloDoSistema(dados);
  const acessos = reg.acessos;
  return (
    <div ref={secaoRef}
      className={`scroll-mt-20 overflow-hidden rounded-xl border bg-white ${realce ? "area-realce" : ""}`}>
      <button
        type="button"
        onClick={aoAlternar}
        aria-expanded={aberta}
        className={`flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left transition-colors ${
          aberta ? "bg-slate-50" : "hover:bg-slate-50"
        }`}
      >
        <ChevronRight size={16} aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform ${aberta ? "rotate-90" : ""}`} />
        <IconeDoSistema sistema={sistema} className="shrink-0 text-slate-500" />
        <span className="text-sm font-semibold text-slate-900">{sisNome}</span>
        <span className="tnum text-sm text-slate-500">
          {/* "nenhuma conta", a mesma palavra da Visao geral: "nenhuma conta"
              la e "0 com conta" aqui pareciam contagens diferentes. */}
          {dados.dentro.length ? `${dados.dentro.length} com conta` : "nenhuma conta"}
          {dados.outros.length > 0 && ` · ${dados.outros.length} só no cadastro`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Selo tom={selo.tom}>{selo.texto}</Selo>
          {selo.mais > 0 && (
            <span className="text-xs text-slate-500" aria-label={`e mais ${selo.mais} ${selo.mais === 1 ? "aviso" : "avisos"}`}>
              +{selo.mais}
            </span>
          )}
        </span>
      </button>

      {aberta && (
        <div className="border-t">
          {selo.todas.length > 0 && (
            <p className="px-4 pt-3 text-sm text-slate-600">
              Situação: {selo.todas.map((x) => x.texto).join(" · ")}
            </p>
          )}
          {/* OS DOIS ENDERECOS. "Abrir" leva a porta da frente; "Acessos
              dentro" leva a tela onde se administra quem entra DENTRO do
              sistema, que e outra coisa e estava faltando. Nem todo sistema tem
              essa segunda alcancavel por link (os apps vanilla sao tela unica
              com abas), e nesses casos a tela DIZ o caminho de cliques em vez de
              oferecer um link que cai na porta da frente e deixa a pessoa
              procurando. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pt-2">
            {reg.url && (
              <a href={reg.url} target="_blank" rel="noreferrer" className="btn-ghost h-10">
                <ExternalLink size={16} aria-hidden="true" /> Abrir o {sisNome}
              </a>
            )}
            {acessos?.url ? (
              <a href={acessos.url} target="_blank" rel="noreferrer" className="btn-ghost h-10">
                <ExternalLink size={16} aria-hidden="true" /> Acessos dentro do {sisNome}
              </a>
            ) : acessos?.caminho ? (
              <span className="px-2 text-sm text-slate-500">Acessos lá dentro: {acessos.caminho}</span>
            ) : null}
          </div>

          {dados.dentro.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Nenhuma conta no {sisNome}.</p>
          ) : (
            <div className="mt-1">
              <div className="area-colunas-conta border-t px-4 pb-1 pt-2 text-xs text-slate-500" aria-hidden="true">
                <span>Login</span><span>Pessoa</span><span>Situação</span><span>Papel</span><span />
              </div>
              {dados.dentro.map((l) => (
                <LinhaContaSistema key={l.login} l={l} sistema={sistema} acoes={acoes} soltas={soltas} />
              ))}
            </div>
          )}

          {/* O RESTO DO ELENCO: quem o sistema conhece e nao tem conta aqui.
              Quando nao ha mais ninguem, a tela DIZ isso: silencio aqui virou
              "esta faltando", e com razao, porque nao da para distinguir "nao tem
              mais gente" de "a tela nao foi buscar". E quem ENTRA por outro
              caminho (sem senha, por link) aparece no proprio resumo: acesso de
              verdade nao fica escondido atras de um clique. */}
          {dados.outros.length === 0 ? (
            <p className="border-t px-4 py-3 text-sm text-slate-500">Ninguém mais no cadastro do {sisNome}.</p>
          ) : (
            <details className="area-saiba border-t">
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-4 py-1 text-sm text-slate-600">
                <ChevronDown size={16} aria-hidden="true" className="area-seta shrink-0 text-slate-400" />
                <span>{plural(dados.outros.length, "pessoa", "pessoas")} só no cadastro do {sisNome}</span>
                {dados.entram.map((x) => (
                  <Selo key={x.como} tom="warn">
                    {x.como === "nome" ? plural(x.n, "entra sem senha", "entram sem senha") : plural(x.n, "entra por link", "entram por link")}
                  </Selo>
                ))}
              </summary>
              <div>
                {dados.outros.map((e) => {
                  const c = COMO_ENTRA[e.como] || COMO_ENTRA.cadastro;
                  return (
                    <LinhaLista key={`${e.como}-${e.nome}`} tom={c.tom}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-[8rem] flex-1 break-words text-sm text-slate-700">{e.nome}</span>
                        {e.detalhe && <span className="shrink-0 text-xs text-slate-500">{e.detalhe}</span>}
                        {c.selo && <Selo tom={c.tom}>{c.selo}</Selo>}
                      </div>
                    </LinhaLista>
                  );
                })}
              </div>
            </details>
          )}

          {dados.fora.length > 0 && (
            <div className="m-3 rounded-xl bg-bad-50 p-4 text-sm text-bad-700">
              <p className="font-semibold">
                {dados.fora.length === 1
                  ? `1 pessoa marcada aqui não tem conta no ${sisNome}`
                  : `${dados.fora.length} pessoas marcadas aqui não têm conta no ${sisNome}`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {dados.fora.map((l) => (
                  <li key={l.login + l.dono.usuario}>
                    {l.dono.nome || l.dono.usuario} entraria como <b className="font-mono">{l.login}</b>, que não existe
                  </li>
                ))}
              </ul>
              <Link to="/acessos?visao=pessoas&recorte=fora" className="btn-outline mt-3 h-10">
                Resolver na aba Pessoas
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* A JORNADA QUE NAO EXISTIA: "a Barbara nao consegue entrar". A resposta
   sempre esteve no equipe_acessos_log e a tela nunca a leu. */
function FalhasDeEntrada({ dados, aoVerPessoa, aoVerTodas }) {
  const lista = dados.naPorta || [];
  const donoDoLogin = (login) =>
    dados.contas.find((c) => c.usuario === login || c.papeis.some((p) => p.login === login || p.real?.login === login));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-[15rem] flex-1 text-sm text-slate-600">
          Falhas de entrada nos últimos 30 dias, por pessoa e sistema. Uma falha antiga pode já ter sido resolvida.
        </p>
        <button type="button" className="btn-ghost h-10" onClick={aoVerTodas}>Ver todas as pessoas</button>
      </div>
      {dados.historicoLimitado && (
        <Aviso tom="aviso">Mostrando os 2.000 eventos mais recentes: o histórico do período está cortado.</Aviso>
      )}
      {lista.length === 0 ? (
        <Empty>Ninguém tentou e falhou nos últimos 30 dias.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          {lista.map((e) => {
            const f = lerFalha(e);
            const situacao = situacaoEntrada(e);
            const bem = situacao === "Entrou após a falha" || situacao === "Há entradas no período";
            const dono = donoDoLogin(e.usuario);
            return (
              <LinhaLista key={`${e.usuario}-${e.sistema}`} tom={e.entradas > 0 ? "warn" : "bad"}>
                <div className="area-falha-linha">
                  <span className="c-login min-w-0 break-all font-mono text-sm font-semibold text-slate-900">{e.usuario}</span>
                  <span className="c-leitura flex min-w-0 flex-wrap items-center gap-2">
                    <span className="chip shrink-0">{nomeCompletoSis(e.sistema)}</span>
                    <span className="min-w-0 text-sm text-slate-600">{f.texto}</span>
                  </span>
                  <span className="c-selo"><Selo tom={bem ? "ok" : "bad"}>{situacao}</Selo></span>
                  <span className="c-meta flex flex-wrap items-center justify-end gap-2">
                    <span className="tnum text-xs text-slate-500">
                      {plural(e.falhas, "falha", "falhas")}
                      {e.ultimaFalha ? ` · última ${new Date(e.ultimaFalha).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}
                    </span>
                    {dono && (
                      <button type="button" className="btn-outline h-10" onClick={() => aoVerPessoa(dono.usuario)}>
                        Ver pessoa
                      </button>
                    )}
                  </span>
                </div>
              </LinhaLista>
            );
          })}
        </div>
      )}
    </div>
  );
}

// "Verificado as 10:02" e o botao de reler. Uma barra so, igual nas duas abas.
function BarraVerificacao({ carregando, verificadoEm, aoAtualizar }) {
  const hora = verificadoEm?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center justify-end gap-1 text-xs text-slate-600">
      <span role="status">{carregando ? "Atualizando…" : hora ? `Verificado às ${hora}` : ""}</span>
      <button type="button" className="btn-ghost h-10 px-3" onClick={aoAtualizar} disabled={carregando}
        aria-label="Atualizar" title="Atualizar">
        <RefreshCw size={16} aria-hidden="true" className={carregando ? "animate-spin" : ""} />
        <span className="area-esconde-estreito">Atualizar</span>
      </button>
    </div>
  );
}

const RECORTES_PESSOA = new Set(["fora", "temporaria", "porta"]);

export default function AcessoUnico({
  aoAvisar, lente = "sistema", sistemaInicial = "", recorteInicial = "", pessoaInicial = "", usuarioDaSessao = "",
}) {
  const [carregando, setCarregando] = useState(true);
  const [verificadoEm, setVerificadoEm] = useState(null);
  const pedido = useRef(0);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [ocupadoCadastro, setOcupadoCadastro] = useState(false);
  const [erroCadastro, setErroCadastro] = useState("");
  // A senha que aparece uma vez (cadastro, "Dar acesso", senha so num sistema).
  // Some do estado quando a janela fecha.
  const [senhaAberta, setSenhaAberta] = useState(null);
  const [definindo, setDefinindo] = useState(null);
  const [abrirPessoa, setAbrirPessoa] = useState(pessoaInicial);
  const [realce, setRealce] = useState("");
  const secoes = useRef({});

  /* O RECORTE VEM DO ENDERECO (a Visao geral manda "com pendencia" direto para
     ?visao=pessoas&recorte=fora). Trocar de aba volta para "todas". */
  const recorteValido = (r, l) => (l === "pessoa" ? (RECORTES_PESSOA.has(r) ? r : "todas") : r === "soltas" ? r : "todas");
  const [recorte, setRecorte] = useState(() => recorteValido(recorteInicial, lente));
  const lenteAnterior = useRef(lente);
  useEffect(() => {
    if (lenteAnterior.current === lente) return;
    lenteAnterior.current = lente;
    setRecorte("todas");
    setBusca("");
  }, [lente]);

  // Quais secoes da lente por sistema estao abertas. Varias ao mesmo tempo e
  // permitido: comparar dois sistemas e uso legitimo, e fechar um para abrir
  // outro seria trabalho a toa.
  const [abertos, setAbertos] = useState(sistemaInicial ? { [sistemaInicial]: true } : {});

  const carregar = useCallback(async () => {
    const id = ++pedido.current;
    setCarregando(true);
    try {
      const resposta = await lerAcessos();
      if (id !== pedido.current) return;
      setDados(resposta);
      setVerificadoEm(new Date());
      setErro(null);
    } catch (e) { if (id === pedido.current) setErro(e.message); }
    finally { if (id === pedido.current) setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  /* LINK DIRETO A UM SISTEMA (?sistema=pcp): a secao abre, a tela rola ate ela
     e ela fica realcada por 2 segundos. Os OUTROS sistemas continuam na lista:
     antes o link preenchia a busca e escondia os outros oito. */
  const jaRolou = useRef(false);
  useEffect(() => {
    if (!dados || !sistemaInicial || jaRolou.current || lente !== "sistema") return;
    jaRolou.current = true;
    if (!dados.sistemas.includes(sistemaInicial)) return;
    requestAnimationFrame(() => secoes.current[sistemaInicial]?.scrollIntoView({ block: "start", behavior: "smooth" }));
    setRealce(sistemaInicial);
    const t = setTimeout(() => setRealce(""), 2000);
    return () => clearTimeout(t);
  }, [dados, sistemaInicial, lente]);

  /* AS ACOES DE UM ACESSO, NUMA IMPLEMENTACAO SO.
     Elas nasceram dentro do cartao da pessoa. Quando a aba de Sistemas passou a
     precisar das mesmas (o dono abriu o PCP, viu os nomes e nao conseguiu mexer
     em nada), copiar seria repetir regra, e regra repetida foi exatamente o
     que produziu quase todos os defeitos desta semana. Entao elas subiram para
     ca e recebem `usuario` como argumento; as duas abas chamam as mesmas. */
  const acoes = useMemo(() => ({
    async papel(usuario, sistema, papel) {
      try {
        await salvarPapel({ usuario, sistema, papel });
        aoAvisar({ tom: "ok", texto: `Papel no ${nomeCompletoSis(sistema)} trocado para ${rotuloPapel(papel)}.` });
        await carregar();
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
    },
    async senha(usuario, nome, sistema) {
      const sis = nomeCompletoSis(sistema);
      if (!confirm(`Gerar uma senha nova para ${nome} SÓ no ${sis}?\n\nVale para quem entra pelo link direto do ${sis}. A senha de entrada dela (a do Painel, que abre todos) NÃO muda.`)) return;
      try {
        const r = await senhaDoSistema(usuario, sistema);
        setSenhaAberta({
          titulo: `Senha nova no ${sis}`, nome, sistemaNome: sis,
          senha: r.senha, login: r.login, provisoria: provisoriaNoSistema(sistema),
        });
        await carregar();
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
    },
    async tirar(usuario, nome, sistema) {
      if (!confirm(`Tirar o acesso de ${nome} ao ${nomeCompletoSis(sistema)}? A conta dela naquele sistema é APAGADA.`)) return;
      try {
        await removerPapel(usuario, sistema);
        aoAvisar({ tom: "ok", texto: `${nome} não entra mais no ${nomeCompletoSis(sistema)}.` });
        await carregar();
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
    },
    /* EDITAR A PESSOA A PARTIR DE UM SISTEMA. Duas coisas numa: o NOME, que e
       o que aparece dentro do sistema (equipe_contas.nome vem de acesso_conta),
       e o LOGIN daquele sistema.

       O nome nao chega sozinho no sistema: `salvarConta` grava aqui, e quem
       leva para la e a proxima gravacao de papel. Por isso as duas chamadas em
       sequencia; senao a tela mostraria "Thiago Cardoso" e o PCP continuaria
       assinando "thiago". A segunda NAO fala de modulo de proposito: chave
       ausente preserva (ver o comentario em painel-acesso/salvarPapel). */
    async editar(conta, sistema, { nome, login, papel }) {
      try {
        if (nome !== undefined && nome !== conta.nome) {
          await salvarConta({
            usuario: conta.usuario, nome, tipo: conta.tipo,
            colaborador: conta.colaborador || "", ativo: conta.ativo !== false,
          });
          await salvarPapel({ usuario: conta.usuario, sistema, papel: papel || "" });
        }
        if (login !== undefined) await apontarLogin(conta.usuario, sistema, login);
        aoAvisar({ tom: "ok", texto: `${nome || conta.nome} atualizado no ${nomeCompletoSis(sistema)}.` });
        await carregar();
        return true;
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); return false; }
    },
    async apontar(usuario, nome, sistema, login) {
      try {
        const r = await apontarLogin(usuario, sistema, login);
        aoAvisar({
          tom: "ok",
          texto: login
            ? `${nome} agora entra no ${nomeCompletoSis(sistema)} como "${r.login}"${r.papel ? ` (${r.papel})` : ""}.`
            : `Apontamento no ${nomeCompletoSis(sistema)} voltou ao padrão.`,
        });
        await carregar();
        return true;
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); return false; }
    },
  }), [carregar, aoAvisar]);

  const criar = useCallback(async (conta, papeis) => {
    setOcupadoCadastro(true);
    setErroCadastro("");
    try {
      const r = await criarPessoa(conta, papeis);
      setCadastrando(false);
      setSenhaAberta({
        titulo: "Pessoa cadastrada", nome: conta.nome || conta.usuario, senha: r.senha,
        login: conta.usuario, provisoria: true,
        itens: resultadoDaSenha({ recusados: r.recusados }),
      });
      // Sistema que recusou nao pode virar silencio: a pessoa foi criada, mas
      // nao entra naquele, e so aqui da para dizer por que.
      if (r.recusados?.length) {
        aoAvisar({
          tom: "erro",
          texto: r.recusados.map((x) => `${nomeCompletoSis(x.sistema)}: ${x.erro}`).join(" · "),
        });
      }
      await carregar();
    } catch (e) {
      // A janela fica aberta com os campos preenchidos; o erro aparece nela.
      setErroCadastro(e.message);
    } finally {
      setOcupadoCadastro(false);
    }
  }, [carregar, aoAvisar]);

  const fecharDefinicao = useCallback((resposta) => {
    const c = definindo;
    setDefinindo(null);
    if (!resposta || !c) return;
    const n = quantosReceberam(resposta);
    aoAvisar({ tom: "ok", texto: `Senha de ${c.nome || c.usuario} definida em ${plural(n, "sistema", "sistemas")}.` });
    carregar();
  }, [definindo, aoAvisar, carregar]);

  const numeros = useMemo(() => (dados ? contarAcessos(dados) : null), [dados]);

  const lista = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.contas.filter((c) => {
      if (q && !`${c.usuario} ${c.nome} ${c.colaborador} ${c.papeis.map((p) => p.login).join(" ")}`
        .toLowerCase().includes(q)) return false;
      /* "Com pendencia" tem de trazer TAMBEM a conta que existe e nao abre
         nada: a celula vermelha manda para este recorte, e uma pessoa acusada
         no topo que nao aparecesse na lista seria o mesmo desencontro que esta
         tela existe para acabar. */
      if (recorte === "fora") return c.papeis.some((p) => temPendencia(p));
      if (recorte === "temporaria") return temSenhaProvisoria(c);
      return true;
    });
  }, [dados, busca, recorte]);

  const listas = dados && (
    <>
      <datalist id="rh-colaboradores">
        {(dados.colaboradores || []).map((n) => <option key={n} value={n} />)}
      </datalist>
      <datalist id="vendedores-erp">
        {(dados.vendedores || []).map((v) => <option key={v.nome} value={v.nome}>{v.n} orçamentos</option>)}
      </datalist>
    </>
  );

  const janelas = (
    <>
      {cadastrando && dados && (
        <JanelaFormulario titulo="Cadastrar pessoa" ocupado={ocupadoCadastro}
          aoFechar={() => { setCadastrando(false); setErroCadastro(""); }}>
          {erroCadastro && <Aviso tom="erro" className="mb-4">{erroCadastro}</Aviso>}
          <NovaPessoa sistemas={dados.sistemas.filter((s) => !ehExterna(s, dados.fontes?.[s]))}
            vendedores={dados.vendedores} contratos={dados.contratos}
            aoCriar={criar} aoCancelar={() => { setCadastrando(false); setErroCadastro(""); }} />
        </JanelaFormulario>
      )}
      {senhaAberta && <JanelaSenha {...senhaAberta} aoFechar={() => setSenhaAberta(null)} />}
      {definindo && <JanelaDefinirSenha c={definindo} aoFechar={fecharDefinicao} />}
    </>
  );

  // ------------------------------------------------ sem dados ainda
  if (!dados) {
    if (erro) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
    return (
      <div className="space-y-3" role="status" aria-label="Carregando acessos">
        {lente === "pessoa" ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
          </>
        ) : (
          <>
            <BarraVerificacao carregando verificadoEm={null} aoAtualizar={carregar} />
            {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-14" />)}
          </>
        )}
      </div>
    );
  }

  const aviso = erro ? <AvisoAtualizacao erro={erro} aoTentar={carregar} /> : null;

  // ------------------------------------------------ aba Sistemas
  if (lente === "sistema") {
    const visiveis = [...dados.sistemas].sort(porOrdem)
      .filter((s) => recorte !== "soltas" || (dados.soltas?.[s] || []).length > 0);
    return (
      <div className="area-bloco">
        {listas}
        {aviso}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {numeros.soltas > 0 && (
              <button type="button" aria-pressed={recorte === "soltas"}
                onClick={() => setRecorte((r) => (r === "soltas" ? "todas" : "soltas"))}
                className={`${recorte === "soltas" ? "chip-sel" : "chip-btn"} min-h-10 px-3 text-sm`}>
                Contas sem dono: {numeros.soltas}
              </button>
            )}
            {recorte === "soltas" && (
              <>
                <span className="text-sm text-slate-600">Mostrando só sistemas com conta sem dono</span>
                <button type="button" className="btn-ghost h-10" onClick={() => setRecorte("todas")}>Ver todos</button>
              </>
            )}
          </div>
          <BarraVerificacao carregando={carregando} verificadoEm={verificadoEm} aoAtualizar={carregar} />
        </div>
        {visiveis.length === 0 ? (
          <Empty>
            <p>Nenhum sistema com conta sem dono.</p>
            <button type="button" className="btn-ghost mt-2 h-10" onClick={() => setRecorte("todas")}>Ver todos</button>
          </Empty>
        ) : (
          <div className="space-y-2">
            {visiveis.map((s) => (
              <SecaoSistema
                key={s}
                sistema={s}
                fonte={dados.fontes?.[s]}
                dados={contasDoSistema(s, dados.contas, dados.soltas, dados.elenco)}
                acoes={acoes}
                soltas={dados.soltas}
                aberta={!!abertos[s]}
                realce={realce === s}
                secaoRef={(el) => { secoes.current[s] = el; }}
                aoAlternar={() => setAbertos((a) => ({ ...a, [s]: !a[s] }))}
              />
            ))}
          </div>
        )}
        <SaibaMais titulo="De onde vêm estes números">
          <p>
            Cada sistema é consultado na hora. A lista mostra as contas que existem lá de verdade,
            de quem é cada uma e quem está só no cadastro. Conta sem dono existe no sistema e não
            está ligada a ninguém aqui: quase sempre é a mesma pessoa com o nome escrito de outro jeito.
          </p>
        </SaibaMais>
        {janelas}
      </div>
    );
  }

  // ------------------------------------------------ aba Pessoas
  const celulas = [
    { id: "todas", rotulo: "Pessoas", valor: numeros.pessoas, sub: "cadastradas aqui", curto: "no total" },
    {
      id: "fora", rotulo: "Com pendência", valor: numeros.pessoasFora,
      cor: numeros.pessoasFora ? "text-bad-700" : "text-slate-900",
      sub: numeros.foraDoLugar ? `${plural(numeros.foraDoLugar, "acesso", "acessos")} para resolver` : "nada a resolver",
      curto: numeros.foraDoLugar ? "resolver agora" : "nada a resolver",
    },
    {
      id: "temporaria", rotulo: "Senha provisória", valor: numeros.pessoasTemporarias,
      cor: numeros.pessoasTemporarias ? "text-warn-700" : "text-slate-900",
      sub: numeros.pessoasTemporarias ? "ainda não trocaram" : "ninguém com senha provisória",
      curto: numeros.pessoasTemporarias ? "não trocaram" : "ninguém",
    },
    {
      id: "porta", rotulo: "Falhas de entrada", valor: numeros.naPorta,
      cor: numeros.naPorta ? "text-warn-700" : "text-slate-900",
      sub: "últimos 30 dias", curto: "30 dias",
    },
  ];
  const pendencias = dados.pendencias || [];
  const verPessoa = (usuario) => {
    setRecorte("todas");
    setBusca(usuario);
    setAbrirPessoa(usuario);
  };

  return (
    <div className="area-bloco">
      {listas}
      {aviso}
      <FaixaNumeros
        celulas={celulas}
        ativo={recorte}
        aoEscolher={(id) => setRecorte((a) => (a === id || id === "todas" ? "todas" : id))}
      />
      {pendencias.length > 0 && (
        <details className="area-saiba rounded-xl bg-warn-50 px-4 text-sm text-warn-800">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 py-1">
            <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
            <span>{plural(pendencias.length, "pendência", "pendências")} de vínculo com o RH.</span>
            <span className="inline-flex items-center gap-1 font-medium underline">Ver quais <ChevronDown size={14} aria-hidden="true" className="area-seta" /></span>
          </summary>
          <ul className="space-y-0.5 pb-3 pl-6">
            {pendencias.map((p) => <li key={p.usuario}>{p.nome || p.usuario}: {p.pendencia}</li>)}
          </ul>
        </details>
      )}

      {recorte === "porta" ? (
        <FalhasDeEntrada dados={dados} aoVerPessoa={verPessoa} aoVerTodas={() => setRecorte("todas")} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="sem-impressao relative min-w-0 flex-1 sm:max-w-sm">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} type="search"
                aria-label="Buscar por nome, usuário ou login" placeholder="Nome, usuário ou login" />
            </div>
            <button type="button" className="btn-primary shrink-0" onClick={() => setCadastrando(true)}>
              <UserPlus size={16} aria-hidden="true" />
              <span className="area-esconde-estreito">Cadastrar pessoa</span>
              <span className="area-so-estreito-720">Cadastrar</span>
            </button>
          </div>
          {/* No celular o "Verificado as" desce para o fim da lista: aqui em
              cima ele empurrava a primeira pessoa para fora da primeira tela. */}
          <div className={`flex flex-wrap items-center justify-between gap-2 ${recorte === "todas" ? "area-esconde-estreito" : ""}`}>
            {recorte !== "todas" ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                Mostrando só pessoas com {recorte === "fora" ? "pendência" : "senha provisória"}.
                <button type="button" className="btn-ghost h-10" onClick={() => setRecorte("todas")}>Ver todas</button>
              </p>
            ) : <span className="area-esconde-estreito" />}
            <div className="area-esconde-estreito">
              <BarraVerificacao carregando={carregando} verificadoEm={verificadoEm} aoAtualizar={carregar} />
            </div>
          </div>

          {lista.length ? (
            <div className="space-y-2">
              {lista.map((c) => (
                <Conta key={c.usuario} c={c} sistemas={dados.sistemas} soltas={dados.soltas}
                  acoes={acoes} aoMudar={carregar} aoAvisar={aoAvisar}
                  aoSenha={setSenhaAberta} aoDefinirSenha={setDefinindo}
                  souEu={!!usuarioDaSessao && c.usuario === usuarioDaSessao}
                  abertaInicial={abrirPessoa === c.usuario} />
              ))}
            </div>
          ) : busca ? (
            <Empty>
              <p>Ninguém com “{busca}”. Busque por nome, usuário ou login.</p>
              <button type="button" className="btn-ghost mt-2 h-10" onClick={() => setBusca("")}>Limpar busca</button>
            </Empty>
          ) : recorte !== "todas" ? (
            <Empty>
              <p>Ninguém neste recorte.</p>
              <button type="button" className="btn-ghost mt-2 h-10" onClick={() => setRecorte("todas")}>Ver todas</button>
            </Empty>
          ) : (
            <Empty>
              <p>Ninguém cadastrado ainda.</p>
              <button type="button" className="btn-primary mt-3" onClick={() => setCadastrando(true)}>
                <UserPlus size={16} aria-hidden="true" /> Cadastrar pessoa
              </button>
            </Empty>
          )}
        </div>
      )}

      {recorte !== "porta" && (
        <div className="area-so-estreito-720">
          <BarraVerificacao carregando={carregando} verificadoEm={verificadoEm} aoAtualizar={carregar} />
        </div>
      )}
      <SaibaMais titulo="Como funcionam as senhas">
        <p>
          Cada pessoa tem uma senha só, que vale no Painel e nos outros sistemas dela. “Definir senha
          para todos os sistemas” troca essa senha. A senha só de um sistema, no menu de cada linha,
          serve para consertar um sistema sem mexer na senha que a pessoa já decorou.
        </p>
      </SaibaMais>
      {janelas}
    </div>
  );
}
