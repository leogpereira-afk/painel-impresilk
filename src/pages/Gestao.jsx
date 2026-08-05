// Gestão: a tela de direção da Impresilk. Cinco blocos, na ordem em que um
// sustenta o outro -- identidade, plano do ano, esquema tático, atas e
// fechamento de ciclo -- escolhidos por ABAS no topo, um por vez.
//
// NÃO é painel de produção nem lista de tarefa do dia: isso já existe em
// Compromissos e nos outros módulos. Aqui é decisão e direção, e por isso a
// tela abre no esquema tático, que é o uso semanal.
//
// O que cada pessoa vê é decidido no SERVIDOR (painel-gestao): colaborador
// recebe só a identidade, gestor recebe o plano e as táticas e apenas as atas
// em que participou. A tela não esconde cartão de dado que ela recebeu.
//
// A EQUIPE vem do RH, ao vivo, e só com id, nome, área, cargo, gestor e se é
// direção -- a ficha de lá tem
// salário, CPF, endereço e perfil comportamental, e nada disso atravessa (ver
// `equipeDoRH` na Edge Function).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, Compass, Target, Swords, FileText, Flag, Plus, Pencil, Trash2,
  Check, Lock, Users, Search,
} from "lucide-react";
import {
  lerGestao, salvarIdentidade, salvarValor, removerValor,
  salvarPlano, salvarObjetivo, removerObjetivo, salvarIndicador, removerIndicador,
  salvarTatica, removerTatica, salvarReuniao, aprovarAta, salvarDecisao, gerarAcoes,
  encerrarCiclo, gravarPreferencia,
} from "../services/gestao.js";
import {
  SITUACOES, porObjetivo, alertaDeCiclo, cumprimentoDecisoes, pautaSugerida,
} from "../lib/calc/gestao.js";
import { dataCurta, dataLonga, ymdLocal, numero } from "../lib/format.js";
import { Card, PageTitle, Empty, CarregandoModulo, ErroModulo } from "../components/ui.jsx";
import EsquemaTatico from "../components/EsquemaTatico.jsx";

const BLOCOS = [
  { id: "identidade", titulo: "Identidade", sub: "missão, visão e valores", icone: Compass },
  { id: "plano", titulo: "Planejamento do ano", sub: "tese, objetivos e indicadores", icone: Target },
  { id: "tatico", titulo: "Esquema tático", sub: "o que está sendo feito agora, e por quem", icone: Swords },
  { id: "atas", titulo: "Reuniões e atas", sub: "o que foi decidido e por quem", icone: FileText },
  { id: "ciclo", titulo: "Fechamento de ciclo", sub: "planejado, realizado e desvio", icone: Flag },
];
const BLOCO_PADRAO = "tatico";

const TIPOS_REUNIAO = {
  semanal_gestao: "Semanal de gestão",
  mensal_resultado: "Mensal de resultado",
  extraordinaria: "Extraordinária",
};

// Cinco sanfonas empilhadas viraram ABAS no topo: com todas fechadas a tela era
// uma lista de títulos, e com duas abertas o que interessava ficava a três
// rolagens de distância. Uma aba por vez, e o botão sempre à vista.
//
// Aba é <button>, não link: a página inteira é um módulo só e trocar de bloco
// não é navegar. Quem chega por teclado percorre a fileira com Tab e escolhe
// com Enter, que é o comportamento nativo.
function Abas({ blocos, atual, aoTrocar, alertas }) {
  return (
    <div className="sem-impressao -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {blocos.map((b) => {
        const Icone = b.icone;
        const ativo = b.id === atual;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => aoTrocar(b.id)}
            aria-pressed={ativo}
            title={b.sub}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 font-display text-sm font-medium transition-all ${
              ativo
                ? "border-brand bg-brand text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
            style={ativo ? undefined : { borderColor: "var(--hairline)" }}
          >
            <Icone size={16} strokeWidth={2.2} className="shrink-0" />
            <span className="whitespace-nowrap">{b.titulo}</span>
            {/* O aviso do fechamento de ciclo tem de aparecer mesmo quando a aba
                está fechada -- era o único motivo de a sanfona ter destaque. */}
            {alertas?.[b.id] && (
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${ativo ? "bg-white" : "bg-warn-600"}`}
                title="precisa de atenção"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── O TIME ───────────────────────────────────────────────────────────────── */
//
// Quem é a casa, por área, e o que cada um tem na mão. A pergunta que isto
// responde é "onde cada um se encontra": quem está com o esquema tático na
// mão, quem está atrasado e quem não recebeu nada.
//
// O nome liga por TEXTO (`tatica.responsavel` é campo livre e sempre foi), e
// texto livre erra: "Jéssica", "jessica" e "Jessica " são a mesma pessoa. Por
// isso a comparação é sem acento e sem caixa -- e quem foi digitado à mão e
// não existe no RH aparece num grupo próprio em vez de sumir da conta.
// Plural escrito por extenso. "5 tatica(s)" e o jeito de nao decidir o plural
// -- e ninguem fala assim. A tela SABE o numero; escrever "(s)" e passar para o
// leitor um trabalho que o codigo tinha como fazer.
const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

const chaveNome = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function montarTime(equipe, taticas, decisoes, hojeISO) {
  const porPessoa = new Map();
  const garantir = (nome, base) => {
    const k = chaveNome(nome);
    if (!k) return null;
    if (!porPessoa.has(k)) {
      porPessoa.set(k, {
        chave: k, nome, area: "", cargo: "", doRH: false,
        abertas: 0, atrasadas: 0, concluidas: 0, decisoesAbertas: 0, ...base,
      });
    }
    return porPessoa.get(k);
  };

  for (const p of equipe || []) {
    garantir(p.nome, { nome: p.nome, area: p.area || "", cargo: p.cargo || "", doRH: true });
  }

  for (const t of taticas || []) {
    const p = garantir(t.responsavel);
    if (!p) continue;
    if (t.status === "concluida") p.concluidas += 1;
    else if (t.status !== "cancelada") {
      p.abertas += 1;
      if (t.prazo && t.prazo < hojeISO) p.atrasadas += 1;
    }
  }
  for (const d of decisoes || []) {
    if (d.status !== "aberta") continue;
    const p = garantir(d.responsavel);
    if (p) p.decisoesAbertas += 1;
  }

  // Quem foi digitado à mão e não casou com o RH quase sempre é NOME PARCIAL:
  // escrever "Pedro" no responsável não bate com "Pedro Henrique Golçalves
  // Pereira". A tela sugere o provável -- mas SÓ quando há um único candidato.
  // Cinco primeiros nomes se repetem na casa (Adriano, Guilherme, José, Pedro,
  // Vinícius), e adivinhar entre dois seria atribuir trabalho à pessoa errada
  // em silêncio, que é pior que não sugerir nada.
  const doRH = [...porPessoa.values()].filter((p) => p.doRH);
  for (const p of porPessoa.values()) {
    if (p.doRH) continue;
    const candidatos = doRH.filter(
      (x) => x.chave.startsWith(p.chave + " ") || p.chave.startsWith(x.chave + " ")
    );
    if (candidatos.length === 1) {
      p.talvez = candidatos[0].nome;
      // A pessoa do RH apontada NÃO pode sair como "sem nada na mão": a tela
      // acabou de dizer, no cartão de cima, que aquele trabalho provavelmente é
      // dela. Duas afirmações contrárias na mesma tela e quem lê acha que o
      // gerente está ocioso.
      candidatos[0].citadoComo = p.nome;
    } else if (candidatos.length > 1) p.ambiguo = candidatos.length;
  }

  const SEM_AREA = "Sem área no RH";
  const FORA = "Não está no RH";
  const grupos = new Map();
  for (const p of porPessoa.values()) {
    const g = !p.doRH ? FORA : p.area || SEM_AREA;
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(p);
  }

  // Área com mais gente em cima; os dois baldes de exceção sempre por último --
  // são pendência de cadastro, não seção do organograma.
  const ordem = [...grupos.entries()]
    .map(([area, pessoas]) => ({
      area,
      excecao: area === SEM_AREA || area === FORA,
      pessoas: pessoas.sort((a, b) =>
        (b.abertas + b.decisoesAbertas) - (a.abertas + a.decisoesAbertas) ||
        a.nome.localeCompare(b.nome, "pt-BR")),
      abertas: pessoas.reduce((s, x) => s + x.abertas, 0),
      atrasadas: pessoas.reduce((s, x) => s + x.atrasadas, 0),
    }))
    .sort((a, b) => (a.excecao - b.excecao) || b.pessoas.length - a.pessoas.length ||
      a.area.localeCompare(b.area, "pt-BR"));

  const todas = [...porPessoa.values()];
  return {
    grupos: ordem,
    total: todas.length,
    doRH: todas.filter((p) => p.doRH).length,
    semNada: todas.filter((p) => p.doRH && !p.abertas && !p.decisoesAbertas && !p.concluidas && !p.citadoComo).length,
    comAtraso: todas.filter((p) => p.atrasadas > 0).length,
  };
}

function BlocoTime({ equipe, taticas, decisoes, hojeISO, filtro, aoFiltrar }) {
  const [busca, setBusca] = useState("");
  const time = useMemo(
    () => montarTime(equipe, taticas, decisoes, hojeISO),
    [equipe, taticas, decisoes, hojeISO]
  );

  const q = chaveNome(busca);
  const grupos = q
    ? time.grupos
        .map((g) => {
          const pessoas = g.pessoas.filter((p) => chaveNome(p.nome + " " + p.cargo).includes(q));
          // `abertas` também tem de encolher: com a busca ativa o cabeçalho dizia
          // "1 pessoa · 14 em andamento" (as 14 do setor inteiro) ao lado de um
          // cartão que mostrava 2. Quem lê atribui as 14 a essa pessoa.
          return { ...g, pessoas, abertas: pessoas.reduce((n, p) => n + p.abertas, 0) };
        })
        .filter((g) => g.pessoas.length)
    : time.grupos;

  if (!time.total) {
    return (
      <Empty>
        Ninguém aqui ainda. A equipe vem do RH — se a lista está vazia, é porque nenhum colaborador
        ativo foi encontrado lá.
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
        <span><b className="text-slate-900">{numero(time.doRH)}</b> no RH</span>
        {time.semNada > 0 && (
          <span><b className="text-slate-900">{numero(time.semNada)}</b> sem nada na mão</span>
        )}
        {time.comAtraso > 0 && (
          <span className="text-bad-700">
            <b>{numero(time.comAtraso)}</b> com atraso
          </span>
        )}
        {filtro && (
          <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => aoFiltrar("")}>
            <Check size={12} /> vendo só {filtro} — limpar
          </button>
        )}
      </div>

      <div className="sem-impressao relative max-w-xs">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pessoa ou cargo" />
      </div>

      {grupos.length === 0 ? (
        <Empty>{`Ninguém com "${busca}".`}</Empty>
      ) : grupos.map((g) => (
        <div key={g.area}>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500">{g.area}</span>
            <span className="text-xs text-slate-400">
              {g.pessoas.length} {g.pessoas.length === 1 ? "pessoa" : "pessoas"}
              {g.abertas ? ` · ${g.abertas} em aberto` : ""}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.pessoas.map((p) => {
              const marcado = chaveNome(filtro) === p.chave;
              // "Sem nada na mão" só quando é verdade de ponta a ponta: quem foi
              // citado por nome parcial tem trabalho, e o cartão diz isso logo acima.
              const nada = p.doRH && !p.abertas && !p.decisoesAbertas && !p.concluidas && !p.citadoComo;
              return (
                <button
                  key={p.chave}
                  type="button"
                  aria-pressed={marcado}
                  // Tocar na pessoa filtra as táticas logo acima: é como se sai
                  // de "quem é o time" para "o que exatamente ele tem".
                  onClick={() => aoFiltrar(marcado ? "" : p.nome)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    marcado ? "border-brand-300 bg-brand-50" : "bg-white hover:bg-slate-50"
                  }`}
                  style={marcado ? undefined : { borderColor: "var(--hairline)" }}
                >
                  {/* SÓ O NOME. O cargo saiu a pedido do dono: o cartão é para
                      bater o olho e ver a carga, e uma segunda linha em cada um
                      transformava o quadro num paredão de texto. O cargo continua
                      na lista do campo "responsável", que é onde ele decide. */}
                  <span className="block truncate font-display text-sm font-medium text-slate-900">{p.nome}</span>
                  {/* Exceção: quando o nome não casou com o RH, dizer o porquê é
                      a única forma de a pessoa arrumar. */}
                  {(p.talvez || p.ambiguo || p.citadoComo) && (
                    <span className="block truncate text-xs text-slate-400">
                      {p.talvez
                        ? `talvez seja ${p.talvez}`
                        : p.ambiguo
                          ? `${p.ambiguo} pessoas começam assim`
                          : `há trabalho lançado como "${p.citadoComo}"`}
                    </span>
                  )}
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    {p.abertas > 0 && <span className="chip-warn">{p.abertas} em aberto</span>}
                    {p.atrasadas > 0 && <span className="chip-bad">{p.atrasadas} atrasada{p.atrasadas > 1 ? "s" : ""}</span>}
                    {p.decisoesAbertas > 0 && <span className="chip">{p.decisoesAbertas} de ata</span>}
                    {p.concluidas > 0 && <span className="chip-ok">{p.concluidas} concluída{p.concluidas > 1 ? "s" : ""}</span>}
                    {nada && <span className="text-xs text-slate-400">sem nada na mão</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 1. IDENTIDADE ────────────────────────────────────────────────────────── */
function CartaoValor({ v, podeEditar, aoEditar, aoRemover }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <button type="button" onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="min-w-0 flex-1 font-display text-sm font-semibold text-slate-900">{v.nome}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${aberto ? "" : "-rotate-90"}`} />
      </button>
      {aberto && (
        <div className="space-y-3 border-t px-4 py-3 text-sm" style={{ borderColor: "var(--hairline)" }}>
          {v.significado && <p className="text-slate-700">{v.significado}</p>}
          {v.comportamento_esperado && (
            <p className="rounded-lg bg-ok-50 px-3 py-2 text-ok-700">
              <b className="font-display">O que se espera:</b> {v.comportamento_esperado}
            </p>
          )}
          {v.comportamento_inaceitavel && (
            <p className="rounded-lg bg-bad-50 px-3 py-2 text-bad-700">
              <b className="font-display">O que não se aceita:</b> {v.comportamento_inaceitavel}
            </p>
          )}
          {podeEditar && (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => aoEditar(v)}>
                <Pencil size={13} /> Editar
              </button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs text-bad-700" onClick={() => aoRemover(v)}>
                <Trash2 size={13} /> Remover
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BlocoIdentidade({ dados, podeEditar, aoRecarregar, aoAvisar }) {
  const { identidade, valores } = dados;
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ missao: "", visao: "", visaoPrazo: "" });
  const [valor, setValor] = useState(null);

  const abrir = () => {
    setF({
      missao: identidade?.missao || "",
      visao: identidade?.visao || "",
      visaoPrazo: identidade?.visao_prazo || "",
    });
    setEditando(true);
  };

  const gravar = async (e) => {
    e.preventDefault();
    try {
      await salvarIdentidade(f);
      setEditando(false);
      await aoRecarregar();
      aoAvisar({ tom: "ok", texto: "Identidade atualizada." });
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const gravarValor = async (e) => {
    e.preventDefault();
    try {
      await salvarValor(valor);
      setValor(null);
      await aoRecarregar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  if (editando) {
    return (
      <form onSubmit={gravar} className="space-y-4">
        <div>
          <label className="label" htmlFor="i-missao">Missão</label>
          <textarea id="i-missao" className="input min-h-[80px]" value={f.missao}
            onChange={(e) => setF((x) => ({ ...x, missao: e.target.value }))}
            placeholder="Por que a empresa existe" />
        </div>
        <div>
          <label className="label" htmlFor="i-visao">Visão</label>
          <textarea id="i-visao" className="input min-h-[80px]" value={f.visao}
            onChange={(e) => setF((x) => ({ ...x, visao: e.target.value }))}
            placeholder="Onde a empresa quer chegar" />
        </div>
        <div className="max-w-xs">
          <label className="label" htmlFor="i-prazo">Prazo da visão</label>
          <input id="i-prazo" type="date" className="input" value={f.visaoPrazo || ""}
            onChange={(e) => setF((x) => ({ ...x, visaoPrazo: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">Salvar</button>
          <button type="button" className="btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {identidade?.missao || identidade?.visao ? (
        <>
          {identidade.missao && (
            <div>
              <p className="label">Missão</p>
              <p className="text-lg leading-relaxed text-slate-800">{identidade.missao}</p>
            </div>
          )}
          {identidade.visao && (
            <div>
              <p className="label">Visão{identidade.visao_prazo ? ` até ${dataCurta(identidade.visao_prazo)}` : ""}</p>
              <p className="text-lg leading-relaxed text-slate-800">{identidade.visao}</p>
            </div>
          )}
        </>
      ) : (
        <Empty>
          Missão e visão ainda não foram escritas. Elas servem para decidir quando não há regra:
          e o que sobra quando o manual não cobre o caso.
        </Empty>
      )}

      <div>
        <p className="label mb-2">Valores</p>
        {valores.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {valores.map((v) => (
              <CartaoValor key={v.id} v={v} podeEditar={podeEditar}
                aoEditar={(x) => setValor({
                  id: x.id, nome: x.nome, significado: x.significado,
                  comportamentoEsperado: x.comportamento_esperado,
                  comportamentoInaceitavel: x.comportamento_inaceitavel, ordem: x.ordem,
                })}
                aoRemover={async (x) => {
                  if (!window.confirm(`Remover o valor "${x.nome}"?`)) return;
                  await removerValor(x.id); await aoRecarregar();
                }} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Nenhum valor escrito. Valor sem comportamento descrito vira quadro na parede.
          </p>
        )}
      </div>

      {valor && (
        <form onSubmit={gravarValor} className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <div>
            <label className="label" htmlFor="v-nome">Nome do valor</label>
            <input id="v-nome" className="input" value={valor.nome} autoFocus
              onChange={(e) => setValor((x) => ({ ...x, nome: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="v-sig">O que significa aqui dentro</label>
            <textarea id="v-sig" className="input" value={valor.significado || ""}
              onChange={(e) => setValor((x) => ({ ...x, significado: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="v-esp">Comportamento esperado</label>
            <textarea id="v-esp" className="input" value={valor.comportamentoEsperado || ""}
              onChange={(e) => setValor((x) => ({ ...x, comportamentoEsperado: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="v-ina">Comportamento inaceitável</label>
            <textarea id="v-ina" className="input" value={valor.comportamentoInaceitavel || ""}
              onChange={(e) => setValor((x) => ({ ...x, comportamentoInaceitavel: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar valor</button>
            <button type="button" className="btn-ghost" onClick={() => setValor(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
        {podeEditar && !valor && (
          <>
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={abrir}>
              <Pencil size={13} /> Editar missão e visão
            </button>
            <button type="button" className="btn-ghost h-8 px-2 text-xs"
              onClick={() => setValor({ nome: "", significado: "", comportamentoEsperado: "", comportamentoInaceitavel: "", ordem: valores.length })}>
              <Plus size={13} /> Novo valor
            </button>
          </>
        )}
        {identidade?.atualizado_por && (
          <span className="ml-auto text-xs text-slate-400">
            atualizado em {dataLonga(String(identidade.atualizado_em).slice(0, 10))} por {identidade.atualizado_por}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── 2. PLANEJAMENTO DO ANO ───────────────────────────────────────────────── */
function BlocoPlano({ dados, podeEditar, aoRecarregar, aoAvisar }) {
  const { plano, objetivos, indicadores, taticas } = dados;
  const [tese, setTese] = useState("");
  const [editTese, setEditTese] = useState(false);
  const [obj, setObj] = useState(null);
  const [ind, setInd] = useState(null);

  const grupos = useMemo(() => porObjetivo(objetivos, indicadores, taticas), [objetivos, indicadores, taticas]);

  const gravarTese = async (e) => {
    e.preventDefault();
    try {
      await salvarPlano({ ano: plano?.ano || new Date().getFullYear(), tese });
      setEditTese(false); await aoRecarregar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  if (!plano && !podeEditar) {
    return <Empty>O plano do ano ainda não foi montado pela diretoria.</Empty>;
  }

  return (
    <div className="space-y-5">
      {editTese ? (
        <form onSubmit={gravarTese} className="space-y-3">
          <div>
            <label className="label" htmlFor="p-tese">Tese do ano</label>
            <textarea id="p-tese" className="input min-h-[80px]" value={tese} autoFocus
              onChange={(e) => setTese(e.target.value)}
              placeholder="A aposta central do ano, numa frase" />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar</button>
            <button type="button" className="btn-ghost" onClick={() => setEditTese(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl bg-brand/5 p-4">
          <p className="label">Tese de {plano?.ano || new Date().getFullYear()}</p>
          <p className="font-display text-lg font-semibold leading-snug text-slate-900">
            {plano?.tese || "Sem tese escrita."}
          </p>
          {podeEditar && (
            <button type="button" className="btn-ghost mt-2 h-8 px-2 text-xs"
              onClick={() => { setTese(plano?.tese || ""); setEditTese(true); }}>
              <Pencil size={13} /> {plano ? "Editar tese" : "Criar o plano do ano"}
            </button>
          )}
        </div>
      )}

      {!grupos.length && <Empty>Nenhum objetivo ainda. De três a cinco bastam: mais que isso não é foco, é lista.</Empty>}

      {grupos.map((g) => {
        const sit = SITUACOES[g.situacao] || SITUACOES.no_rumo;
        return (
          <div key={g.id} className="rounded-xl border p-4" style={{ borderColor: "var(--hairline)" }}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sit.ponto}`} />
              <span className="min-w-0 flex-1 font-display text-sm font-semibold text-slate-900">{g.titulo}</span>
              <span className={sit.chip}>{sit.rotulo}</span>
              {podeEditar && (
                <>
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                    onClick={() => setObj({ id: g.id, titulo: g.titulo, responsavel: g.responsavel, situacao: g.situacao, ordem: g.ordem })}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                    onClick={async () => {
                      if (!window.confirm(`Remover o objetivo "${g.titulo}"? As táticas dele ficam sem objetivo — não são apagadas.`)) return;
                      await removerObjetivo(g.id); await aoRecarregar();
                    }}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {g.responsavel ? `Responsável: ${g.responsavel} · ` : ""}
              {plural(g.abertas, "tática em aberto", "táticas em aberto")} · {plural(g.concluidas, "concluída", "concluídas")}
            </p>

            {g.indicadores.map((i) => {
              const pct = i.meta ? Math.min(100, Math.round((Number(i.atual) / Number(i.meta)) * 100)) : 0;
              return (
                <div key={i.id} className="mb-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{i.nome}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {numero(i.atual)} / {numero(i.meta)} {i.unidade}
                    </span>
                    {podeEditar && (
                      <button type="button" className="shrink-0 text-slate-400 hover:text-slate-700"
                        onClick={() => setInd({ id: i.id, objetivoId: g.id, nome: i.nome, unidade: i.unidade, meta: i.meta, atual: i.atual, ordem: i.ordem })}>
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-ok-600" : pct >= 60 ? "bg-brand" : "bg-warn-600"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}

            {podeEditar && (
              <button type="button" className="btn-ghost mt-2 h-8 px-2 text-xs"
                onClick={() => setInd({ objetivoId: g.id, nome: "", unidade: "", meta: 0, atual: 0, ordem: g.indicadores.length })}>
                <Plus size={13} /> Indicador
              </button>
            )}
          </div>
        );
      })}

      {podeEditar && plano && !obj && (
        <button type="button" className="btn-ghost h-9 px-3 text-sm"
          onClick={() => setObj({ planoAnoId: plano.id, titulo: "", responsavel: "", situacao: "no_rumo", ordem: objetivos.length })}>
          <Plus size={14} /> Novo objetivo
        </button>
      )}

      {obj && (
        <form className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await salvarObjetivo({ ...obj, planoAnoId: obj.planoAnoId || plano.id });
              setObj(null); await aoRecarregar();
            } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
          }}>
          <div>
            <label className="label" htmlFor="o-titulo">Objetivo</label>
            <input id="o-titulo" className="input" value={obj.titulo} autoFocus
              onChange={(e) => setObj((x) => ({ ...x, titulo: e.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="o-resp">Responsável</label>
              <input id="o-resp" className="input" value={obj.responsavel || ""}
                onChange={(e) => setObj((x) => ({ ...x, responsavel: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="o-sit">Situação</label>
              <select id="o-sit" className="input" value={obj.situacao}
                onChange={(e) => setObj((x) => ({ ...x, situacao: e.target.value }))}>
                {Object.entries(SITUACOES).map(([id, s]) => <option key={id} value={id}>{s.rotulo}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar objetivo</button>
            <button type="button" className="btn-ghost" onClick={() => setObj(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {ind && (
        <form className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}
          onSubmit={async (e) => {
            e.preventDefault();
            try { await salvarIndicador(ind); setInd(null); await aoRecarregar(); }
            catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
          }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="n-nome">Indicador</label>
              <input id="n-nome" className="input" value={ind.nome} autoFocus
                onChange={(e) => setInd((x) => ({ ...x, nome: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="n-meta">Meta</label>
              <input id="n-meta" className="input" inputMode="decimal" value={ind.meta}
                onChange={(e) => setInd((x) => ({ ...x, meta: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="n-atual">Hoje</label>
              <input id="n-atual" className="input" inputMode="decimal" value={ind.atual}
                onChange={(e) => setInd((x) => ({ ...x, atual: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="n-un">Unidade</label>
              <input id="n-un" className="input" value={ind.unidade || ""} placeholder="R$, %, un"
                onChange={(e) => setInd((x) => ({ ...x, unidade: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar indicador</button>
            <button type="button" className="btn-ghost" onClick={() => setInd(null)}>Cancelar</button>
            {ind.id && (
              <button type="button" className="btn-ghost text-bad-700"
                onClick={async () => { await removerIndicador(ind.id); setInd(null); await aoRecarregar(); }}>
                Remover
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/* ── 4. REUNIOES E ATAS ───────────────────────────────────────────────────── */
function BlocoAtas({ dados, papel, aoRecarregar, aoAvisar }) {
  const { reunioes, decisoes, objetivos, taticas } = dados;
  const [aberta, setAberta] = useState(null);
  const [nova, setNova] = useState(null);
  const [dec, setDec] = useState(null);

  const cumpre = useMemo(() => cumprimentoDecisoes(decisoes, taticas), [decisoes, taticas]);
  const r = aberta ? reunioes.find((x) => x.id === aberta) : null;
  const minhasDecisoes = r ? decisoes.filter((d) => d.reuniao_id === r.id) : [];
  const travada = r?.status === "aprovada";

  const criar = async (e) => {
    e.preventDefault();
    try {
      const criada = await salvarReuniao(nova);
      setNova(null); setAberta(criada.id); await aoRecarregar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  if (r) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => setAberta(null)}>
          ← Voltar para a lista
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-semibold text-slate-900">
            {TIPOS_REUNIAO[r.tipo]} · {dataCurta(r.data)}
          </span>
          {travada && (
            <span className="chip-ok inline-flex items-center gap-1">
              <Lock size={12} /> aprovada por {r.aprovada_por}
            </span>
          )}
        </div>

        {r.pauta && (
          <div>
            <p className="label">Pauta</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{r.pauta}</p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="r-registro">Registro da reunião</label>
          <textarea id="r-registro" className="input min-h-[120px]" defaultValue={r.registro} disabled={travada}
            onBlur={async (e) => {
              if (travada || e.target.value === r.registro) return;
              try { await salvarReuniao({ ...r, reuniaoId: r.id, id: r.id, registro: e.target.value, participantes: r.participantes }); await aoRecarregar(); }
              catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
            }} />
        </div>

        <div>
          <p className="label mb-2">Decisões</p>
          {minhasDecisoes.length ? (
            <div className="space-y-2">
              {minhasDecisoes.map((d) => (
                <div key={d.id} className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
                  <p className="text-sm text-slate-800">{d.texto}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[d.responsavel, d.prazo ? `até ${dataCurta(d.prazo)}` : null].filter(Boolean).join(" · ") || "sem responsável"}
                    {taticas.some((t) => t.decisao_id === d.id) && " · virou tática"}
                  </p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Nenhuma decisão registrada.</p>}
        </div>

        {!travada && (
          <>
            {dec ? (
              <form className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try { await salvarDecisao({ ...dec, reuniaoId: r.id }); setDec(null); await aoRecarregar(); }
                  catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
                }}>
                <div>
                  <label className="label" htmlFor="d-texto">O que ficou decidido</label>
                  <textarea id="d-texto" className="input" value={dec.texto} autoFocus
                    onChange={(e) => setDec((x) => ({ ...x, texto: e.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="d-resp">Responsável</label>
                    <input id="d-resp" className="input" value={dec.responsavel}
                      onChange={(e) => setDec((x) => ({ ...x, responsavel: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="d-prazo">Prazo</label>
                    <input id="d-prazo" type="date" className="input" value={dec.prazo || ""}
                      onChange={(e) => setDec((x) => ({ ...x, prazo: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary">Salvar decisão</button>
                  <button type="button" className="btn-ghost" onClick={() => setDec(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                <button type="button" className="btn-ghost h-9 px-3 text-sm"
                  onClick={() => setDec({ texto: "", responsavel: "", prazo: "" })}>
                  <Plus size={14} /> Nova decisão
                </button>
                {/* R4: as decisoes viram taticas. O objetivo e perguntado aqui
                    porque R3 vale tambem para o que nasce de ata. */}
                <GerarAcoes reuniao={r} objetivos={objetivos} aoRecarregar={aoRecarregar} aoAvisar={aoAvisar} />
                {papel === "diretoria" && (
                  <button type="button" className="btn-ghost h-9 px-3 text-sm"
                    onClick={async () => {
                      if (!window.confirm("Aprovar esta ata? Depois disso ela não pode mais ser alterada.")) return;
                      try { await aprovarAta(r.id); await aoRecarregar(); aoAvisar({ tom: "ok", texto: "Ata aprovada." }); }
                      catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
                    }}>
                    <Check size={14} /> Aprovar ata
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cumpre.geral.total > 0 && (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="label">Decisões cumpridas no prazo</p>
          <p className="font-display text-2xl font-bold text-slate-900">
            {cumpre.geral.pct}% <span className="text-sm font-normal text-slate-500">
              ({cumpre.geral.noPrazo} de {cumpre.geral.total})
            </span>
          </p>
          {cumpre.porPessoa.length > 1 && (
            <div className="mt-2 space-y-1">
              {cumpre.porPessoa.map((p) => (
                <div key={p.nome} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{p.nome}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">{p.pct}% ({p.noPrazo}/{p.total})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {nova ? (
        <form onSubmit={criar} className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="nr-tipo">Tipo</label>
              <select id="nr-tipo" className="input" value={nova.tipo}
                onChange={(e) => {
                  const tipo = e.target.value;
                  setNova((x) => ({ ...x, tipo, pauta: pautaSugerida(reunioes, decisoes, tipo) }));
                }}>
                {Object.entries(TIPOS_REUNIAO).map(([id, t]) => <option key={id} value={id}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="nr-data">Data</label>
              <input id="nr-data" type="date" className="input" value={nova.data}
                onChange={(e) => setNova((x) => ({ ...x, data: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="nr-part">Participantes (separados por vírgula)</label>
            <input id="nr-part" className="input" value={nova.participantesTexto}
              onChange={(e) => setNova((x) => ({ ...x, participantesTexto: e.target.value }))} />
            <p className="mt-1 text-xs text-slate-500">
              Quem não está aqui não vê esta ata. A separação é feita no servidor.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="nr-pauta">Pauta</label>
            <textarea id="nr-pauta" className="input min-h-[100px]" value={nova.pauta}
              onChange={(e) => setNova((x) => ({ ...x, pauta: e.target.value }))} />
            <p className="mt-1 text-xs text-slate-500">
              Já veio preenchida com o que ficou em aberto nas reuniões anteriores deste mesmo tipo.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Criar reunião</button>
            <button type="button" className="btn-ghost" onClick={() => setNova(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-primary"
          onClick={() => setNova({
            tipo: "semanal_gestao", data: ymdLocal(new Date()), participantesTexto: "",
            pauta: pautaSugerida(reunioes, decisoes, "semanal_gestao"),
          })}>
          <Plus size={15} strokeWidth={2.4} /> Nova reunião
        </button>
      )}

      {reunioes.length ? (
        <div className="space-y-2">
          {reunioes.map((x) => {
            const abertas = decisoes.filter((d) => d.reuniao_id === x.id && d.status === "aberta").length;
            return (
              <button key={x.id} type="button" onClick={() => setAberta(x.id)}
                className="flex w-full flex-wrap items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-slate-50"
                style={{ borderColor: "var(--hairline)" }}>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-medium text-slate-900">
                    {TIPOS_REUNIAO[x.tipo]}
                  </span>
                  <span className="block text-xs text-slate-500">{dataLonga(x.data)}</span>
                </span>
                {abertas > 0 && <span className="chip-warn shrink-0">{abertas} em aberto</span>}
                {x.status === "aprovada" && <span className="chip-ok shrink-0">aprovada</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <Empty>Nenhuma reunião registrada. A ata é o que faz a decisão sobreviver à semana.</Empty>
      )}
    </div>
  );
}

// Botao separado porque ele precisa perguntar o objetivo antes de gerar (R3).
function GerarAcoes({ reuniao, objetivos, aoRecarregar, aoAvisar }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [objetivoId, setObjetivoId] = useState("");

  if (!escolhendo) {
    return (
      <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={() => setEscolhendo(true)}>
        <Swords size={14} /> Gerar ações
      </button>
    );
  }
  return (
    <div className="w-full rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
      <p className="mb-2 text-sm text-slate-700">
        As decisões em aberto viram táticas. A qual objetivo do ano elas pertencem?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input h-9 w-auto py-0 text-sm" value={objetivoId} onChange={(e) => setObjetivoId(e.target.value)}>
          <option value="">Escolha o objetivo...</option>
          {objetivos.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
        </select>
        <button type="button" className="btn-primary h-9 px-3 text-sm" disabled={!objetivoId}
          onClick={async () => {
            try {
              const r = await gerarAcoes(reuniao.id, objetivoId);
              setEscolhendo(false);
              await aoRecarregar();
              aoAvisar({
                tom: r.criadas ? "ok" : "aviso",
                texto: r.criadas ? `${r.criadas} ${r.criadas === 1 ? "tática criada" : "táticas criadas"} a partir das decisões.`
                                 : "Nenhuma decisão nova para virar tática.",
              });
            } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
          }}>
          Gerar
        </button>
        <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={() => setEscolhendo(false)}>Cancelar</button>
      </div>
    </div>
  );
}

/* ── 5. FECHAMENTO DE CICLO ───────────────────────────────────────────────── */
function BlocoCiclo({ dados, podeEditar, hojeISO, aoRecarregar, aoAvisar }) {
  const { plano, objetivos, indicadores, taticas, decisoes, ciclos } = dados;
  const alerta = alertaDeCiclo(hojeISO);
  const [f, setF] = useState({ realizado: "", desvios: "", aprendizados: "" });
  const [verHistorico, setVerHistorico] = useState(false);

  const concluidas = taticas.filter((t) => t.status === "concluida");
  const naoConcluidas = taticas.filter((t) => t.status === "aberta" || t.status === "em_andamento");
  const decisoesPendentes = decisoes.filter((d) => d.status === "aberta");

  if (!plano) return <Empty>Sem plano do ano, não há ciclo para fechar.</Empty>;

  return (
    <div className="space-y-5">
      <div className={`rounded-xl p-3 text-sm ${alerta.destaque ? "bg-warn-50 text-warn-700" : "bg-slate-50 text-slate-600"}`}>
        {alerta.destaque
          ? `${alerta.dias === 0 ? "Hoje é o último dia" : `Faltam ${plural(alerta.dias, "dia", "dias")}`} para o fim do ${alerta.tipo === "anual" ? "ano" : "trimestre"}. Hora de fechar o ciclo.`
          : `Próximo fechamento de trimestre em ${alerta.dias} ${alerta.dias === 1 ? "dia" : "dias"}.`}
      </div>

      {/* Tres colunas: planejado, realizado, desvio. Os dois primeiros vem do
          banco; o desvio e o unico que precisa de gente para explicar. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="label">Planejado</p>
          <p className="mt-1 text-sm text-slate-700">{plural(objetivos.length, "objetivo", "objetivos")}</p>
          <p className="text-sm text-slate-700">{plural(indicadores.length, "indicador", "indicadores")}</p>
          <p className="text-sm text-slate-700">{plural(taticas.length, "tática", "táticas")}</p>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="label">Realizado</p>
          <p className="mt-1 text-sm text-ok-700">
            {concluidas.length === 1 ? "1 tática concluída" : `${concluidas.length} táticas concluídas`}
          </p>
          <p className="text-sm text-slate-700">
            {plural(indicadores.filter((i) => Number(i.atual) >= Number(i.meta) && Number(i.meta) > 0).length, "indicador na meta", "indicadores na meta")}
          </p>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="label">Desvio</p>
          <p className="mt-1 text-sm text-bad-700">
            {naoConcluidas.length === 1 ? "1 tática não concluída" : `${naoConcluidas.length} táticas não concluídas`}
          </p>
          <p className="text-sm text-bad-700">
            {decisoesPendentes.length === 1 ? "1 decisão de ata pendente" : `${decisoesPendentes.length} decisões de ata pendentes`}
          </p>
        </div>
      </div>

      {podeEditar && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="c-realizado">O que de fato aconteceu</label>
            <textarea id="c-realizado" className="input min-h-[70px]" value={f.realizado}
              onChange={(e) => setF((x) => ({ ...x, realizado: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="c-desvios">Desvios e por que aconteceram</label>
            <textarea id="c-desvios" className="input min-h-[70px]" value={f.desvios}
              onChange={(e) => setF((x) => ({ ...x, desvios: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="c-aprend">Aprendizados e ajustes de rota</label>
            <textarea id="c-aprend" className="input min-h-[70px]" value={f.aprendizados}
              onChange={(e) => setF((x) => ({ ...x, aprendizados: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-2">
            {["trimestral", "anual"].map((tipo) => (
              <button key={tipo} type="button"
                className={tipo === "anual" ? "btn-ghost" : "btn-primary"}
                onClick={async () => {
                  const aviso = tipo === "anual"
                    ? "Encerrar o ANO? O plano atual é congelado, um plano novo é criado, e as táticas pendentes atravessam sem objetivo para você religar."
                    : "Fechar o trimestre? O retrato de hoje fica guardado e o plano do ano continua ativo.";
                  if (!window.confirm(aviso)) return;
                  try {
                    const r = await encerrarCiclo({
                      tipo, periodo: tipo === "anual" ? String(plano.ano) : `${plano.ano} T${Math.ceil(Number(hojeISO.slice(5, 7)) / 3)}`,
                      ...f,
                    });
                    setF({ realizado: "", desvios: "", aprendizados: "" });
                    await aoRecarregar();
                    aoAvisar({
                      tom: "ok",
                      texto: r.encerrouPlano
                        ? `Ano encerrado. Plano novo criado; ${r.taticasQueAtravessaram} ${r.taticasQueAtravessaram === 1 ? "tática atravessou" : "táticas atravessaram"}.`
                        : "Trimestre fechado e guardado no histórico.",
                    });
                  } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
                }}>
                <Flag size={14} /> {tipo === "anual" ? "Encerrar o ano" : "Fechar o trimestre"}
              </button>
            ))}
          </div>
        </div>
      )}

      {ciclos.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
          <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => setVerHistorico((v) => !v)}>
            <ChevronDown size={13} className={verHistorico ? "" : "-rotate-90"} />
            Ciclos anteriores ({ciclos.length})
          </button>
          {verHistorico && (
            <div className="mt-2 space-y-2">
              {ciclos.map((c) => (
                <div key={c.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--hairline)" }}>
                  <p className="font-display font-semibold text-slate-900">
                    {c.periodo} · {c.tipo === "anual" ? "anual" : "trimestral"}
                  </p>
                  {c.realizado && <p className="mt-1 text-slate-700"><b>Realizado:</b> {c.realizado}</p>}
                  {c.desvios && <p className="text-slate-700"><b>Desvios:</b> {c.desvios}</p>}
                  {c.aprendizados && <p className="text-slate-700"><b>Aprendizados:</b> {c.aprendizados}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    congelado com {plural((c.snapshot_planejado?.taticas || []).length, "tática", "táticas")} ·
                    {" "}{dataLonga(String(c.criado_em).slice(0, 10))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── TELA ─────────────────────────────────────────────────────────────────── */
export default function Gestao() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  // Aba escolhida. A preferência gravada por pessoa continua valendo: o bloco
  // que ela deixou aberto vira a aba que abre. Sem isso, quem usa a tela toda
  // semana pelo esquema tático voltaria ao padrão a cada visita.
  const [aba, setAba] = useState(BLOCO_PADRAO);
  // Dentro do esquema tático: as táticas ou o quadro do time.
  const [verTime, setVerTime] = useState(false);
  const [pessoaFiltro, setPessoaFiltro] = useState("");
  const primeiraCarga = useRef(true);
  const abaAnterior = useRef(BLOCO_PADRAO);
  const hojeISO = ymdLocal(new Date());

  const carregar = useCallback(async () => {
    try {
      const d = await lerGestao();
      setDados(d);
      setErro(null);
      // SÓ NA PRIMEIRA CARGA. `carregar()` roda de novo a cada gravação (salvar
      // uma tática, aprovar uma ata), e reaplicar a preferência ali jogava a
      // pessoa para outra aba no meio do trabalho -- o servidor ainda não sabe
      // da aba que ela acabou de escolher.
      if (primeiraCarga.current && d.preferencias && Object.keys(d.preferencias).length) {
        const marcado = BLOCOS.filter((b) => d.preferencias[b.id]);
        // O formato antigo marcava VÁRIAS (era acordeão). Com mais de uma
        // marcada não dá para saber qual era a última usada: fica no padrão.
        if (marcado.length === 1) setAba(marcado[0].id);
      }
      primeiraCarga.current = false;
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const trocarAba = (id) => {
    setAba(id);
    // UMA gravação por toque, e só a da aba escolhida. Gravar as cinco (quatro
    // desmarcando) disparava cinco requisições em paralelo, sem ordem garantida
    // entre elas -- duas podiam terminar marcadas e a próxima visita abriria na
    // errada. A limpeza das outras é feita na LEITURA, que ignora preferência
    // ambígua e cai no padrão.
    gravarPreferencia(id, true);
    BLOCOS.filter((b) => b.id !== id && b.id === abaAnterior.current)
      .forEach((b) => gravarPreferencia(b.id, false));
    abaAnterior.current = id;
  };

  if (erro) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (!dados) return <CarregandoModulo />;

  const papel = dados.papel;
  const ehDiretoria = papel === "diretoria";
  const alerta = alertaDeCiclo(hojeISO);

  // Colaborador recebe so a identidade -- e o servidor que corta. A tela mostra
  // o que recebeu, sem fingir que existe mais.
  if (papel === "colaborador") {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Gestão" descricao="A identidade da Impresilk: por que existimos e o que não se negocia." />
        <Card>
          <BlocoIdentidade dados={dados} podeEditar={false} aoRecarregar={carregar} aoAvisar={setAviso} />
        </Card>
      </div>
    );
  }

  const equipe = dados.equipe || [];
  const blocoAtual = BLOCOS.find((b) => b.id === aba) || BLOCOS[0];

  const conteudo = {
    identidade: <BlocoIdentidade dados={dados} podeEditar={ehDiretoria} aoRecarregar={carregar} aoAvisar={setAviso} />,
    plano: <BlocoPlano dados={dados} podeEditar={ehDiretoria} aoRecarregar={carregar} aoAvisar={setAviso} />,
    tatico: (
      <div className="space-y-4">
        {/* Duas leituras do mesmo bloco: "o que está sendo feito" e "quem está
            com o quê". Escolher uma pessoa no quadro filtra a lista de táticas
            -- é o caminho de "quem é o time" para "o que ele tem na mão". */}
        <div className="sem-impressao inline-flex rounded-xl border bg-white p-1"
             style={{ borderColor: "var(--hairline)" }}>
          {[
            { id: false, rotulo: "Táticas", icone: Swords },
            { id: true, rotulo: "Time", icone: Users },
          ].map((v) => {
            const Ic = v.icone;
            return (
              <button
                key={String(v.id)}
                type="button"
                aria-pressed={verTime === v.id}
                onClick={() => setVerTime(v.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-sm font-medium transition-colors ${
                  verTime === v.id ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Ic size={15} strokeWidth={2.2} />
                {v.rotulo}
              </button>
            );
          })}
        </div>

        {/* Os DOIS ficam montados, e um esconde. Trocar por ternário desmontava
            o EsquemaTatico e levava junto o formulário aberto: o caminho que a
            própria tela sugere -- começar a tática, ir ver quem está livre,
            voltar -- apagava o que já tinha sido digitado, sem perguntar. */}
        <div className={verTime ? "" : "hidden"}>
          <BlocoTime
            equipe={equipe}
            taticas={dados.taticas}
            decisoes={dados.decisoes}
            hojeISO={hojeISO}
            filtro={pessoaFiltro}
            aoFiltrar={(nome) => {
              setPessoaFiltro(nome);
              // Escolher a pessoa leva de volta às táticas dela: ficar no quadro
              // depois de filtrar não mostraria o resultado do próprio toque.
              if (nome) setVerTime(false);
            }}
          />
        </div>
        <div className={verTime ? "hidden" : ""}>
          <EsquemaTatico
            taticas={dados.taticas}
            objetivos={dados.objetivos}
            escopo="empresa"
            empresaId={dados.empresaId}
            mostrarVinculoObjetivo
            permitirCriar
            permitirEditar
            pessoas={equipe}
            respFiltrado={pessoaFiltro}
            aoFiltrarResp={setPessoaFiltro}
            hojeISO={hojeISO}
            aoSalvar={async (t) => { await salvarTatica(t); await carregar(); }}
            aoRemover={async (id) => { await removerTatica(id); await carregar(); }}
          />
        </div>
      </div>
    ),
    atas: <BlocoAtas dados={dados} papel={papel} aoRecarregar={carregar} aoAvisar={setAviso} />,
    ciclo: <BlocoCiclo dados={dados} podeEditar={ehDiretoria} hojeISO={hojeISO} aoRecarregar={carregar} aoAvisar={setAviso} />,
  };

  return (
    <div className="space-y-4">
      <PageTitle
        titulo="Gestão"
        descricao="Identidade, plano do ano, o que está sendo feito agora e o que ficou decidido. Não é painel de produção: é direção."
      />

      <Abas
        blocos={BLOCOS}
        atual={aba}
        aoTrocar={trocarAba}
        alertas={{ ciclo: alerta.destaque }}
      />

      {aviso && (
        <p className={`rounded-lg px-3 py-2 text-sm ${
          aviso.tom === "ok" ? "bg-ok-50 text-ok-700"
            : aviso.tom === "aviso" ? "bg-warn-50 text-warn-700" : "bg-bad-50 text-bad-700"
        }`}>
          {aviso.texto}
        </p>
      )}

      <Card className={aba === "ciclo" && alerta.destaque ? "ring-2 ring-warn-600" : ""}>
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-base font-semibold text-slate-900">{blocoAtual.titulo}</h2>
          <p className="text-sm text-slate-500">{blocoAtual.sub}</p>
          {aba === "ciclo" && alerta.destaque && (
            <span className="chip-warn">
              {alerta.dias <= 0
                ? `fecha hoje o ciclo ${alerta.tipo}`
                : `faltam ${alerta.dias} ${alerta.dias === 1 ? "dia" : "dias"} para fechar o ciclo ${alerta.tipo}`}
            </span>
          )}
        </div>
        {conteudo[aba]}
      </Card>
    </div>
  );
}
