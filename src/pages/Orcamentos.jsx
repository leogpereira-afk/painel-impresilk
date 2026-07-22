// Modulo 4: Orcamentos acima do valor minimo. Conversao do time, motivos de
// perda e orcamentos parados. Trocar o motivo de um perdido ou incluir/retirar
// vendedor recalcula a tela ao vivo (useMemo + overrides/config da fundacao).
//
// A tela e navegavel: os KPIs do topo, as linhas de "Por vendedor" e as barras
// de "Por que perdemos" sao FILTROS clicaveis da lista mestra de orcamentos, que
// tambem tem busca, situacao e linhas expansiveis.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Percent,
  TrendingDown,
  Plus,
  Trash2,
  Clock,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { useApp } from "../config/store.jsx";
import { calcOrcamentos } from "../lib/calc/orcamentos.js";
import { moeda, numero, pct, dataLonga, ymdLocal } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  BarRow,
  StatusLine,
  Segmented,
  Empty,
  CarregandoModulo,
  ErroModulo,
  BotaoPDF,
  CabecalhoImpressao,
} from "../components/ui.jsx";

// Normaliza para busca (sem acento, minusculo).
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Data de hoje (AAAA-MM-DD) no fuso local, para carimbar a baixa manual.
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ROTULO_SITUACAO = {
  aberto: "Aberto",
  ganho: "Ganho",
  perdido: "Perdido",
};

const CHIP_SITUACAO = {
  aberto: "chip-warn",
  ganho: "chip-ok",
  perdido: "chip-bad",
};

export default function Orcamentos() {
  const {
    config,
    dados,
    overridesOrcamentos,
    setOverrideOrcamento,
    updateConfig,
    pronto,
    erro,
    recarregar,
  } = useApp();

  const [novoVendedor, setNovoVendedor] = useState("");
  // Filtros da lista mestra. Todos se combinam e viram selos removiveis.
  const [situacao, setSituacao] = useState("todos"); // todos|aberto|ganho|perdido|parado
  const [periodo, setPeriodo] = useState("todos"); // "todos" | "AAAA-MM"
  const [busca, setBusca] = useState("");
  const [vendedorSel, setVendedorSel] = useState(null); // {id, nome}
  const [motivoSel, setMotivoSel] = useState(null); // {chave, id, nome}
  const [expandido, setExpandido] = useState(null);
  // Lista grande (centenas de orcamentos) mostra um lote por vez, com
  // "mostrar mais", para nao renderizar tudo de uma vez e travar a tela.
  const [limite, setLimite] = useState(25);
  const listaRef = useRef(null);

  // Antes de imprimir, mostra a lista inteira (a tela pagina em lotes de 25).
  useEffect(() => {
    const expandir = () => setLimite(Number.MAX_SAFE_INTEGER);
    window.addEventListener("beforeprint", expandir);
    return () => window.removeEventListener("beforeprint", expandir);
  }, []);

  const vm = useMemo(
    () => (dados ? calcOrcamentos(dados.orcamentos, overridesOrcamentos, config) : null),
    [dados, overridesOrcamentos, config]
  );

  const filtrados = useMemo(() => {
    if (!vm) return [];
    const q = norm(busca.trim());
    return vm.lista.filter((o) => {
      if (situacao === "parado" && !o.parado) return false;
      if (situacao !== "todos" && situacao !== "parado" && o.situacao !== situacao) return false;
      if (vendedorSel && o.vendedorId !== vendedorSel.id) return false;
      if (motivoSel) {
        if (o.situacao !== "perdido") return false;
        if ((o.motivoPerdaId || "sem") !== motivoSel.chave) return false;
      }
      if (q) {
        const alvo = norm(`${o.cliente} ${o.numero} ${o.vendedorNome} ${o.trabalho || ""}`);
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [vm, situacao, busca, vendedorSel, motivoSel]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const k = vm.kpis;
  const motivos = config.motivosPerda || [];
  const maiorMotivo = vm.porMotivoPerda[0]?.valor || 0;

  const temFiltro = situacao !== "todos" || !!busca || !!vendedorSel || !!motivoSel;
  const somaFiltrada = filtrados.reduce((s, o) => s + o.valor, 0);
  const visiveis = filtrados.slice(0, limite);
  const restantes = filtrados.length - visiveis.length;

  function limparTudo() {
    setSituacao("todos");
    setBusca("");
    setVendedorSel(null);
    setMotivoSel(null);
    setLimite(25);
  }

  const irParaLista = () =>
    listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Clique num KPI liga/desliga a situacao correspondente e leva para a lista.
  // Limpa os outros filtros para o KPI ser previsivel (senao o clique podia cair
  // num "0 orcamentos" por causa de um filtro anterior ainda ligado).
  function alternarSituacao(nova) {
    setSituacao((s) => (s === nova ? "todos" : nova));
    setBusca("");
    setVendedorSel(null);
    setMotivoSel(null);
    setLimite(25);
    irParaLista();
  }

  function alternarVendedor(v) {
    setVendedorSel((atual) =>
      atual?.id === v.vendedorId ? null : { id: v.vendedorId, nome: v.nome }
    );
    setLimite(25);
    irParaLista();
  }

  function alternarMotivo(m) {
    const chave = m.motivoId || "sem";
    setMotivoSel((atual) =>
      atual?.chave === chave ? null : { chave, id: m.motivoId, nome: m.nome }
    );
    setSituacao("perdido");
    setLimite(25);
    irParaLista();
  }

  function incluirVendedor() {
    const nome = novoVendedor.trim();
    if (!nome) return;
    // O id PRECISA ser o proprio nome: no Mubisys o `vendedorId` do orcamento e
    // o nome do vendedor (ver src/lib/calc/orcamentos.js). Com um id gerado
    // ("v-1753...") a linha nascia e ficava para sempre em 0 orcamentos / R$ 0,
    // porque nunca casava com nada vindo do ERP.
    updateConfig((c) => {
      const ja = (c.vendedores || []).some((v) => v.id === nome);
      if (!ja) c.vendedores.push({ id: nome, nome });
      return c;
    });
    setNovoVendedor("");
  }

  // Ocultar, nao "remover": a tabela e reconstruida a partir dos ORCAMENTOS, e
  // quem tem ao menos um volta na hora seguinte. Antes o clique na lixeira
  // gravava no Blobs e a linha continuava igual na tela -- parecia defeito.
  function retirarVendedor(id) {
    if (vendedorSel?.id === id) setVendedorSel(null);
    updateConfig((c) => {
      c.vendedores = (c.vendedores || []).filter((v) => v.id !== id);
      c.vendedoresOcultos = [...new Set([...(c.vendedoresOcultos || []), id])];
      return c;
    });
  }

  const opcoesSituacao = [
    { valor: "todos", rotulo: "Todos" },
    { valor: "aberto", rotulo: "Abertos" },
    { valor: "ganho", rotulo: "Ganhos" },
    { valor: "perdido", rotulo: "Perdidos" },
    { valor: "parado", rotulo: "Parados" },
  ];

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Orcamentos"
        descricao={
          "Acima de " +
          moeda(config.parametros.valorMinimoOrcamento) +
          ", desde " +
          dataLongaCorte(config.parametros.dataCorteOrcamentos) +
          ". Clique nos numeros para filtrar a lista."
        }
        acao={<BotaoPDF titulo="Gera um PDF da lista de orcamentos com o recorte atual" />}
      />

      <CabecalhoImpressao
        titulo="Impresilk - Orcamentos"
        linhas={[
          `Emitido em ${dataLonga(ymdLocal(new Date()))} · ${numero(filtrados.length)} orcamentos · ${moeda(
            filtrados.reduce((s, o) => s + (o.valor || 0), 0)
          )}`,
          `Recorte: ${situacao === "todos" ? "todos" : ROTULO_SITUACAO[situacao] || situacao}${periodo !== "todos" ? ` · ${periodo}` : ""}${busca ? ` · busca "${busca}"` : ""}`,
        ]}
      />

      {/* KPIs: clicaveis, filtram a lista -- viram cartoes mortos no papel */}
      <div className="sem-impressao grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          rotulo="Na mesa"
          valor={moeda(k.naMesaValor)}
          sub={numero(k.naMesaQtd) + " orcamentos aguardando"}
          tom="brand"
          icone={FileText}
          ativo={situacao === "aberto"}
          onClick={() => alternarSituacao("aberto")}
        />
        <StatCard
          rotulo="Conversao do time"
          valor={pct(k.conversao)}
          sub={numero(k.ganhosQtd) + " ganhos, " + numero(k.perdidosQtd) + " perdidos"}
          tom={k.conversao >= 40 ? "ok" : "warn"}
          icone={Percent}
          ativo={situacao === "ganho"}
          onClick={() => alternarSituacao("ganho")}
        />
        <StatCard
          rotulo="Valor perdido no periodo"
          valor={moeda(k.valorPerdido)}
          sub={numero(k.perdidosQtd) + " orcamentos que nao fecharam"}
          tom="bad"
          icone={TrendingDown}
          ativo={situacao === "perdido"}
          onClick={() => alternarSituacao("perdido")}
        />
      </div>

      {/* Por vendedor */}
      <Card>
        <SectionTitle
          titulo="Por vendedor"
          sub="Quem esta convertendo. Clique numa linha para ver os orcamentos do vendedor. Ajuste a equipe abaixo, a tabela recalcula na hora."
        />

        <div className="sem-impressao mb-4 flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Nome do vendedor"
            aria-label="Nome do vendedor"
            value={novoVendedor}
            onChange={(e) => setNovoVendedor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") incluirVendedor();
            }}
          />
          <button className="btn-primary" onClick={incluirVendedor} disabled={!novoVendedor.trim()}>
            <Plus size={16} strokeWidth={2.4} />
            Incluir
          </button>
        </div>

        {vm.porVendedor.length === 0 ? (
          <Empty>Nenhum vendedor cadastrado.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">Vendedor</th>
                  <th className="th text-right">Orcamentos</th>
                  <th className="th text-right">Valor</th>
                  <th className="th text-right">Ganhos</th>
                  <th className="th text-right">Perdidos</th>
                  <th className="th text-right">Conversao</th>
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody>
                {vm.porVendedor.map((v) => {
                  const semDados = v.ganhos + v.perdidos === 0;
                  const corConv = semDados
                    ? "text-slate-400"
                    : v.conversao >= 40
                    ? "text-ok-700"
                    : "text-bad-700";
                  const sel = vendedorSel?.id === v.vendedorId;
                  return (
                    <tr
                      key={v.vendedorId}
                      role="button"
                      tabIndex={0}
                      aria-pressed={sel}
                      onClick={() => alternarVendedor(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          alternarVendedor(v);
                        }
                      }}
                      className={`cursor-pointer transition-colors ${
                        sel ? "bg-brand/5" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="td font-medium text-slate-900">{v.nome}</td>
                      <td className="td tnum text-right">{numero(v.qtd)}</td>
                      <td className="td tnum text-right">{moeda(v.valor)}</td>
                      <td className="td tnum text-right text-ok-700">{numero(v.ganhos)}</td>
                      <td className="td tnum text-right text-bad-700">{numero(v.perdidos)}</td>
                      <td className={"td tnum text-right font-semibold " + corConv}>
                        {semDados ? "-" : pct(v.conversao)}
                      </td>
                      <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-ghost btn-danger inline-flex h-8 w-8 items-center justify-center p-0"
                          title={"Retirar " + v.nome}
                          onClick={() => retirarVendedor(v.vendedorId)}
                        >
                          <Trash2 size={16} strokeWidth={2.2} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Por que perdemos: cada motivo e um filtro clicavel */}
      <Card>
        <SectionTitle
          titulo="Por que perdemos"
          sub="O valor deixado na mesa, por motivo. Clique num motivo para ver os orcamentos."
        />

        {vm.porMotivoPerda.length === 0 ? (
          <Empty>Nenhuma perda registrada no periodo.</Empty>
        ) : (
          <>
            <div className="space-y-2">
              {vm.porMotivoPerda.map((m, i) => {
                const chave = m.motivoId || "sem";
                const sel = motivoSel?.chave === chave;
                return (
                  <button
                    key={chave}
                    onClick={() => alternarMotivo(m)}
                    aria-pressed={sel}
                    className={`w-full rounded-xl p-2 text-left transition-colors ${
                      sel ? "bg-brand/5 ring-1 ring-brand/40" : "hover:bg-slate-50"
                    }`}
                  >
                    <BarRow
                      rotulo={m.nome}
                      valorTexto={moeda(m.valor)}
                      pct={maiorMotivo ? (m.valor / maiorMotivo) * 100 : 0}
                      tom={i === 0 ? "bad" : "warn"}
                      sub={numero(m.qtd) + (m.qtd === 1 ? " orcamento" : " orcamentos")}
                    />
                  </button>
                );
              })}
            </div>

            {vm.motivoLider && (
              <div className="mt-5 rounded-xl bg-brand/5 p-4">
                <p className="label mb-1 text-brand">Maior motivo: {vm.motivoLider.nome}</p>
                <p className="text-sm text-slate-700">{vm.acaoLider}</p>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Lista mestra: busca, situacao, selos e linhas expansiveis */}
      <Card ref={listaRef}>
        <SectionTitle
          titulo="Orcamentos"
          sub="Clique na linha para ver os detalhes. Nos perdidos, marque o motivo para afinar a analise."
          acao={<Segmented opcoes={opcoesSituacao} valor={situacao} onChange={setSituacao} />}
        />

        <div className="sem-impressao mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, numero, vendedor ou trabalho"
              className="input pl-9"
              aria-label="Buscar orcamento por cliente, numero, vendedor ou trabalho"
            />
          </div>

          {temFiltro && (
            <button className="btn-ghost" onClick={limparTudo}>
              <X size={15} /> Limpar filtros
            </button>
          )}
        </div>

        {/* Resumo do que esta na tela + selos de filtro ativos */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>
            Mostrando{" "}
            <strong className="tnum text-slate-900">{numero(filtrados.length)}</strong> de{" "}
            {numero(vm.lista.length)} orcamentos
            {filtrados.length > 0 && (
              <>
                {" "}
                · <strong className="tnum text-slate-900">{moeda(somaFiltrada)}</strong>
              </>
            )}
          </span>
          {situacao === "parado" && (
            <button className="chip-warn" onClick={() => setSituacao("todos")}>
              parados ha mais de {config.parametros.diasParado} dias <X size={12} />
            </button>
          )}
          {vendedorSel && (
            <button className="chip-warn" onClick={() => setVendedorSel(null)}>
              vendedor: {vendedorSel.nome} <X size={12} />
            </button>
          )}
          {motivoSel && (
            <button className="chip-bad" onClick={() => setMotivoSel(null)}>
              motivo: {motivoSel.nome} <X size={12} />
            </button>
          )}
          {busca && (
            <button className="chip" onClick={() => setBusca("")}>
              busca: {busca} <X size={12} />
            </button>
          )}
        </div>

        {visiveis.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr>
                    <th className="th text-left">Cliente</th>
                    <th className="th text-left">Vendedor</th>
                    <th className="th text-right">Valor</th>
                    <th className="th text-left">Situacao</th>
                    <th className="th text-right">Dias</th>
                    <th className="th text-left">Motivo da perda</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((o) => {
                    const aberto = expandido === o.id;
                    return (
                      <Fragment key={o.id}>
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-expanded={aberto}
                          onClick={() => setExpandido(aberto ? null : o.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setExpandido(aberto ? null : o.id);
                            }
                          }}
                          className="cursor-pointer transition-colors hover:bg-slate-50"
                        >
                          <td className="td">
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                size={16}
                                strokeWidth={2.4}
                                className={`shrink-0 text-slate-400 transition-transform ${
                                  aberto ? "rotate-90" : ""
                                }`}
                              />
                              <span className="font-display font-medium text-slate-900">
                                {o.cliente}
                              </span>
                              {o.parado && <span className="chip-warn shrink-0">parado</span>}
                            </div>
                            <p className="mt-0.5 pl-6 text-xs text-slate-500">
                              Orcamento {o.numero}
                              {o.trabalho ? `, ${o.trabalho}` : ""}
                            </p>
                          </td>
                          <td className="td text-slate-600">{o.vendedorNome}</td>
                          <td className="td tnum text-right font-semibold text-slate-900">
                            {moeda(o.valor)}
                          </td>
                          <td className="td">
                            <span
                              className={CHIP_SITUACAO[o.situacao] || "chip"}
                              title={o.baixaManual ? `Baixa manual (o ERP marca "${ROTULO_SITUACAO[o.situacaoErp] || o.situacaoErp}")` : undefined}
                            >
                              {ROTULO_SITUACAO[o.situacao] || o.situacao}
                              {o.baixaManual && " ✎"}
                            </span>
                          </td>
                          <td className="td text-right">
                            {o.parado ? (
                              <StatusLine tom={o.dias >= 21 ? "bad" : "warn"}>
                                <span className="tnum inline-flex items-center gap-1">
                                  <Clock size={13} strokeWidth={2.4} />
                                  {numero(o.dias)} dias
                                </span>
                              </StatusLine>
                            ) : (
                              <span className="tnum text-slate-700">{numero(o.dias)} dias</span>
                            )}
                          </td>
                          <td className="td" onClick={(e) => e.stopPropagation()}>
                            {o.situacao === "perdido" ? (
                              <select
                                className="select"
                                aria-label={"Motivo da perda do orcamento " + o.numero}
                                value={o.motivoPerdaId || ""}
                                onChange={(e) =>
                                  setOverrideOrcamento(o.id, {
                                    motivoPerdaId: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">Motivo nao informado</option>
                                {motivos.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.nome}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-slate-400">-</span>
                            )}
                            {/* No papel o <select> some. Sem este texto, o PDF
                                de "Perdidos" saia com a coluna do motivo em
                                branco -- justamente o dado que a tela pede para
                                o gestor classificar. */}
                            {o.situacao === "perdido" && (
                              <span className="apenas-impressao">
                                {o.motivoPerdaNome || "nao informado"}
                              </span>
                            )}
                          </td>
                        </tr>

                        {aberto && (
                          <tr>
                            <td colSpan={6} className="px-4 pb-4 pt-0">
                              <div
                                className="rounded-xl border bg-slate-50 p-4"
                                style={{ borderColor: "var(--hairline)" }}
                              >
                                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                                  <Detalhe rotulo="Cliente" valor={o.cliente} />
                                  <Detalhe rotulo="Orcamento" valor={String(o.numero || "-")} />
                                  <Detalhe rotulo="Vendedor" valor={o.vendedorNome} />
                                  <Detalhe rotulo="Valor" valor={moeda(o.valor)} />
                                  <Detalhe
                                    rotulo="Situacao"
                                    valor={ROTULO_SITUACAO[o.situacao] || o.situacao}
                                  />
                                  <Detalhe
                                    rotulo="Enviado em"
                                    valor={o.dataEnvio ? dataLonga(o.dataEnvio) : "nao informado"}
                                  />
                                  <Detalhe
                                    rotulo="Fechado em"
                                    valor={
                                      o.dataFechamento ? dataLonga(o.dataFechamento) : "em aberto"
                                    }
                                  />
                                  <Detalhe rotulo="Dias desde o envio" valor={`${numero(o.dias)} dias`} />
                                  <Detalhe rotulo="Trabalho" valor={o.trabalho || "nao informado"} />
                                  {o.situacao === "perdido" && (
                                    <Detalhe
                                      rotulo="Motivo da perda"
                                      valor={o.motivoPerdaNome || "nao informado"}
                                    />
                                  )}
                                </dl>

                                {/* Dar baixa: registrar o desfecho de um orcamento
                                    que o ERP deixou em aberto. Persiste no Blobs. */}
                                <div
                                  className="mt-3 border-t pt-3"
                                  style={{ borderColor: "var(--hairline)" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <p className="label mb-2">
                                    Dar baixa
                                    {o.baixaManual
                                      ? ` · baixa manual (ERP: ${ROTULO_SITUACAO[o.situacaoErp] || o.situacaoErp})`
                                      : ` · o ERP marca "${ROTULO_SITUACAO[o.situacaoErp] || o.situacaoErp}"`}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      className={o.situacao === "ganho" ? "chip-ok" : "btn-ghost"}
                                      onClick={() =>
                                        setOverrideOrcamento(o.id, {
                                          situacao: "ganho",
                                          dataBaixa: hojeISO(),
                                        })
                                      }
                                    >
                                      Ganho
                                    </button>
                                    <button
                                      className={o.situacao === "perdido" ? "chip-bad" : "btn-ghost"}
                                      onClick={() =>
                                        setOverrideOrcamento(o.id, {
                                          situacao: "perdido",
                                          dataBaixa: hojeISO(),
                                        })
                                      }
                                    >
                                      Perdido
                                    </button>
                                    {o.baixaManual && (
                                      <button
                                        className="btn-ghost text-slate-500"
                                        onClick={() =>
                                          setOverrideOrcamento(o.id, {
                                            situacao: null,
                                            dataBaixa: null,
                                          })
                                        }
                                      >
                                        Desfazer baixa
                                      </button>
                                    )}
                                    {o.situacao === "perdido" && (
                                      <select
                                        className="select ml-auto"
                                        aria-label={"Motivo da perda do orcamento " + o.numero}
                                        value={o.motivoPerdaId || ""}
                                        onChange={(e) =>
                                          setOverrideOrcamento(o.id, {
                                            motivoPerdaId: e.target.value || null,
                                          })
                                        }
                                      >
                                        <option value="">Motivo nao informado</option>
                                        {motivos.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {m.nome}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                  {o.dataBaixa && (
                                    <p className="mt-2 text-xs text-slate-500">
                                      Baixa registrada em {dataLonga(o.dataBaixa)}.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {restantes > 0 && (
              <button className="btn-ghost mt-3" onClick={() => setLimite((n) => n + 25)}>
                Mostrar mais ({numero(restantes)} restantes)
              </button>
            )}
          </>
        ) : (
          <Empty>
            Nenhum orcamento neste filtro.
            {temFiltro && (
              <button className="btn-ghost ml-2" onClick={limparTudo}>
                Limpar filtros
              </button>
            )}
          </Empty>
        )}
      </Card>
    </div>
  );
}

// Item do painel de detalhes da linha expandida.
function Detalhe({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <dt className="label mb-0.5">{rotulo}</dt>
      <dd className="truncate text-sm text-slate-800" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

// A data de corte ja vem no formato AAAA-MM-DD (nao e timestamp). Formato para
// dd/mm/aaaa direto, no mesmo padrao de exibicao do format.js.
function dataLongaCorte(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).split("-");
  return `${d}/${m}/${a}`;
}
