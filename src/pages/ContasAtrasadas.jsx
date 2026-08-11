// Contas Atrasadas: quem esta devendo, por que, e o que fazer agora.
// Conclusao primeiro. Todo o calculo vem de calcContasAtrasadas e recalcula ao
// vivo quando o usuario marca motivo, marca cobrado ou muda a config.
//
// A tela e navegavel: os KPIs do topo e as faixas de idade sao FILTROS
// clicaveis, ha busca por empresa, e cada linha de titulo expande com os
// detalhes. A lista de titulos vem logo abaixo do painel de numeros.

import { Fragment, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Repeat,
  Timer,
  Gauge,
  Phone,
  CheckCircle2,
  ChevronRight,
  Search,
  User,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useApp } from "../config/store.jsx";
import { calcContasAtrasadas, agruparDividas } from "../lib/calc/contasAtrasadas.js";
import { moeda, numero, dataLonga, dataCurta, rotuloMes, ymdLocal, MESES } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  BarRow,
  Segmented,
  Empty,
  CarregandoModulo,
  ErroModulo,
  BotaoPDF,
  CabecalhoImpressao,
  AvisoDadoParado,
} from "../components/ui.jsx";

// Cor de barra por grupo de causa.
function tomDoGrupo(grupo) {
  if (grupo === "interna") return "bad";
  if (grupo === "cliente") return "warn";
  if (grupo === "processo") return "brand";
  return "neutral";
}

const MARCA = "#3840E8";

// Normaliza para busca (sem acento, minusculo).
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function ContasAtrasadas() {
  const {
    config,
    dados,
    overridesRecebiveis,
    setOverrideRecebivel,
    pronto,
    erro,
    recarregar,
    frescorDe,
    fontesNegadas = [],
  } = useApp();

  // A fonte DESTA tela. Perguntar pelo minimo global carimbaria "de ontem" por
  // causa de `pagar`, que esta tela nem le.
  const atualizadoEm = frescorDe("contas-atrasadas");

  const [filtro, setFiltro] = useState("todos");
  const [diasMin, setDiasMin] = useState(30);
  const [busca, setBusca] = useState("");
  const [faixaSel, setFaixaSel] = useState(null); // {faixa, de, ate}
  const [expandido, setExpandido] = useState(null); // id do titulo aberto
  // Padrao = vencimento mais RECENTE: e o que acabou de vencer, onde a cobranca
  // ainda tem chance real de recuperar. O historico antigo continua a um clique
  // no seletor.
  const [ordem, setOrdem] = useState("recentes"); // valor | recentes | antigos | atraso
  const [venceDe, setVenceDe] = useState(""); // periodo de vencimento (YYYY-MM-DD)
  const [venceAte, setVenceAte] = useState("");
  // A tela abre em "Todos" para TODO MUNDO. Ja tentamos abrir na carteira de
  // quem entrou (lendo o vendedor da sessao) e foi pior: nenhuma conta tem
  // vendedor ligado, entao a pre-selecao nunca acontecia e so restava a
  // aparencia de defeito. Quem quiser a propria carteira escolhe no seletor.
  const [vendedorSel, setVendedorSel] = useState(""); // carteira de um vendedor
  const [anoSel, setAnoSel] = useState(""); // ano de vencimento (AAAA)
  const [mesSel, setMesSel] = useState(""); // mes de vencimento (01-12)
  const [visao, setVisao] = useState("mes"); // dash das dividas: ano | mes | cliente
  const titulosRef = useRef(null);

  const vm = useMemo(
    () =>
      dados
        ? calcContasAtrasadas(
            dados.recebiveis,
            overridesRecebiveis,
            config,
            dados.dsoHist,
            dados.ordens
          )
        : null,
    [dados, overridesRecebiveis, config]
  );

  // O vendedor de cada titulo vem do mapa das O.S., que e servido pelo modulo
  // Produtos. Quem nao tem esse modulo recebe 403 e a lista fica com TODOS os
  // titulos sem vendedor -- entao a tela avisa em vez de deixar parecer que
  // ninguem vendeu nada.
  const semVendedor = fontesNegadas.includes("ordens");

  // Pedir um periodo (ano ou intervalo de datas) e o gesto que revela a divida
  // antiga. So o mes nao basta: "junho" sem ano nao e um pedido pelo passado.
  const pediuPeriodo = !!anoSel || !!venceDe || !!venceAte;

  // Frase que descreve o recorte, para carimbar no PDF: sem isto o papel sai
  // sem dizer o que esta (e o que nao esta) na lista.
  const resumoFiltros = useMemo(() => {
    const p = [];
    if (filtro !== "todos") p.push({ pendentes: "so pendentes de cobranca", reincidentes: "so reincidentes", acima: `atraso acima de ${diasMin} dias` }[filtro] || filtro);
    if (anoSel) p.push(`ano ${anoSel}`);
    if (mesSel) p.push(`mes ${MESES[Number(mesSel) - 1]}`);
    if (venceDe || venceAte)
      p.push(`vencimento de ${venceDe ? dataCurta(venceDe) : "o inicio"} a ${venceAte ? dataCurta(venceAte) : "hoje"}`);
    if (vendedorSel) p.push(`vendedor ${vendedorSel}`);
    if (faixaSel) p.push(`idade ${faixaSel.faixa}`);
    if (busca) p.push(`busca "${busca}"`);
    return p.length ? p.join(" · ") : "todos os titulos em atraso";
  }, [filtro, diasMin, anoSel, mesSel, venceDe, venceAte, vendedorSel, faixaSel, busca]);

  const titulosFiltrados = useMemo(() => {
    if (!vm) return [];
    const min = Number(diasMin) || 0;
    const q = norm(busca.trim());
    const filtrados = vm.titulos.filter((t) => {
      if (filtro === "pendentes" && t.cobrado) return false;
      if (filtro === "reincidentes" && !t.reincidente) return false;
      if (filtro === "acima" && t.dias < min) return false;
      if (faixaSel && (t.dias < faixaSel.de || t.dias > faixaSel.ate)) return false;
      // Periodo por data de vencimento (inclusivo). Titulo sem vencimento so
      // aparece quando nenhuma ponta do periodo esta preenchida.
      if (venceDe || venceAte) {
        if (!t.vencimento) return false;
        if (venceDe && t.vencimento < venceDe) return false;
        if (venceAte && t.vencimento > venceAte) return false;
      }
      if (vendedorSel && !t.vendedores.includes(vendedorSel)) return false;
      // Divida anterior ao corte (calote velho) fica fora da lista e dos totais
      // ate o gestor pedir aquele periodo de proposito -- por ano ou por data.
      if (t.antiga && !pediuPeriodo) return false;
      // Ano e mes de vencimento: atalhos rapidos que somam ao periodo livre.
      if (anoSel && (t.vencimento || "").slice(0, 4) !== anoSel) return false;
      if (mesSel && (t.vencimento || "").slice(5, 7) !== mesSel) return false;
      if (q) {
        const alvo = norm(`${t.cliente} ${t.cnpj} ${t.nf} ${t.os} ${t.vendedor}`);
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    // "recentes/antigos" = por vencimento; vazio vai sempre para o fim.
    const porVenc = (dir) => (a, b) => {
      if (!a.vencimento) return 1;
      if (!b.vencimento) return -1;
      return dir * a.vencimento.localeCompare(b.vencimento);
    };
    const ordenadores = {
      valor: (a, b) => b.valor - a.valor,
      recentes: porVenc(-1),
      antigos: porVenc(1),
      atraso: (a, b) => b.dias - a.dias,
    };
    return [...filtrados].sort(ordenadores[ordem] || ordenadores.valor);
  }, [
    vm,
    filtro,
    diasMin,
    busca,
    faixaSel,
    ordem,
    venceDe,
    venceAte,
    vendedorSel,
    anoSel,
    mesSel,
    pediuPeriodo,
  ]);

  // Dash das dividas: sempre sobre a lista JA filtrada, para responder sobre o
  // que o gestor esta olhando (e nao sobre um total que nao esta na tela).
  const dividas = useMemo(() => agruparDividas(titulosFiltrados), [titulosFiltrados]);

  // Anos disponiveis (dos titulos, nao inventados), para o seletor.
  const anosDisponiveis = useMemo(() => {
    if (!vm) return [];
    return [...new Set(vm.titulos.map((t) => (t.vencimento || "").slice(0, 4)).filter(Boolean))].sort(
      (a, b) => b.localeCompare(a)
    );
  }, [vm]);

  /* Opcoes do seletor de vendedor. "Nao localizado" fica de fora da lista: nao e
     pessoa, e o titulo cuja O.S. nao casou com nenhuma venda.

     FICA ACIMA DOS RETURNS DE ERRO/CARREGANDO de proposito. Hook depois de um
     return so roda em ALGUNS renders, e React conta hooks por posicao: na
     primeira passagem (carregando) sao N, quando os dados chegam viram N+1 e o
     React derruba a tela inteira com "Rendered more hooks than during the
     previous render". Por isso o `vm?.` — aqui `vm` ainda pode ser null. */
  const opcoesVendedor = useMemo(
    () => (vm?.porVendedor || []).filter((v) => v.nome && v.nome !== "Nao localizado"),
    [vm]
  );

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const k = vm.kpis;
  const tomDso = k.dso <= k.dsoMeta ? "ok" : k.dso <= k.dsoAlerta ? "warn" : "bad";

  const opcoesFiltro = [
    { valor: "todos", rotulo: "Todos" },
    { valor: "pendentes", rotulo: "Pendentes" },
    { valor: "reincidentes", rotulo: "Reincidentes" },
    { valor: "acima", rotulo: "Acima de X dias" },
  ];

  const temFiltro =
    filtro !== "todos" ||
    !!busca ||
    !!faixaSel ||
    !!venceDe ||
    !!venceAte ||
    !!vendedorSel ||
    !!anoSel ||
    !!mesSel;
  const limparTudo = () => {
    setFiltro("todos");
    setBusca("");
    setFaixaSel(null);
    setVenceDe("");
    setVenceAte("");
    setVendedorSel("");
    setAnoSel("");
    setMesSel("");
  };
  const irParaTitulos = () =>
    titulosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Clique num KPI liga/desliga o filtro correspondente e leva para a lista.
  // Limpa busca e faixa para o KPI ser um filtro previsivel (senao o clique
  // podia cair num "0 titulos" por causa de um filtro anterior ainda ligado).
  const alternarFiltro = (novo) => {
    setFiltro((f) => (f === novo ? "todos" : novo));
    setFaixaSel(null);
    setBusca("");
    irParaTitulos();
  };
  const somaFiltrada = titulosFiltrados.reduce((s, t) => s + t.valor, 0);

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Contas Atrasadas"
        descricao="Quem esta devendo, por que, e o que fazer agora. Clique nos números para filtrar a lista."
      />

      <AvisoDadoParado atualizadoEm={atualizadoEm} />

      {semVendedor && (
        <p className="flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          O vendedor de cada título vem do módulo Produtos, que não esta liberado para você --
          por isso a coluna de vendedor aparece vazia. Os valores e as datas estão corretos.
        </p>
      )}

      {/* KPIs: clicaveis, filtram a lista de titulos abaixo */}
      {/* Os KPIs sao filtros clicaveis: no papel viram cartoes mortos e ainda
          saem pela metade (os que nao tem clique nao sao botoes). O cabecalho
          de impressao ja carrega total e quantidade. */}
      <div className="sem-impressao grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          rotulo="Total atrasado"
          valor={moeda(k.totalAtrasado)}
          sub={`${numero(k.qtd)} títulos em aberto`}
          tom="brand"
          icone={AlertTriangle}
          ativo={!temFiltro}
          onClick={() => {
            limparTudo();
            irParaTitulos();
          }}
        />
        <StatCard
          rotulo="Pendentes de cobrança"
          valor={numero(k.pendentesQtd)}
          sub={moeda(k.pendentesValor)}
          tom="warn"
          icone={Clock}
          ativo={filtro === "pendentes"}
          onClick={() => alternarFiltro("pendentes")}
        />
        <StatCard
          rotulo="Reincidentes"
          valor={numero(k.reincidentesQtd)}
          sub={moeda(k.reincidentesValor)}
          tom="bad"
          icone={Repeat}
          ativo={filtro === "reincidentes"}
          onClick={() => alternarFiltro("reincidentes")}
        />
        <StatCard
          rotulo="DSO"
          valor={`${k.dso} dias`}
          sub={`meta ${k.dsoMeta} dias`}
          tom={tomDso}
          icone={Gauge}
          tendencia={k.dsoTendencia}
        />
        <StatCard
          rotulo="Maior atraso"
          valor={`${numero(k.maiorAtrasoDias)} dias`}
          sub={k.maiorAtrasoCliente}
          tom="neutral"
          icone={Timer}
          ativo={!!busca && busca === k.maiorAtrasoCliente}
          onClick={() => {
            setFiltro("todos");
            setFaixaSel(null);
            setBusca((b) => (b === k.maiorAtrasoCliente ? "" : k.maiorAtrasoCliente));
            irParaTitulos();
          }}
        />
      </div>

      {/* Titulos: logo abaixo do painel de numeros */}
      <Card ref={titulosRef}>
        <CabecalhoImpressao
          atualizadoEm={atualizadoEm}
          titulo="Impresilk - Contas a receber em atraso"
          linhas={[
            `Emitido em ${dataLonga(ymdLocal(new Date()))} · ${numero(titulosFiltrados.length)} titulos · ${moeda(somaFiltrada)}`,
            `Recorte: ${resumoFiltros}${
              vm.antigas.qtd > 0 && !pediuPeriodo
                ? ` · nao inclui ${numero(vm.antigas.qtd)} titulos anteriores a ${dataLonga(vm.antigas.corte)} (${moeda(vm.antigas.valor)})`
                : ""
            }`,
          ]}
        />

        <SectionTitle
          className="sem-impressao"
          titulo="Títulos"
          sub="Clique na linha para ver os detalhes. Classifique o motivo e marque o que já foi cobrado."
          acao={<BotaoPDF titulo="Gera um PDF com exatamente o recorte que esta na tela" />}
        />

        {/* Barra de busca e filtros, em dois niveis.
            NIVEL 1: buscar e ordenar -- o que se usa a toda hora, com a busca
            dominando a largura (ela e a acao principal).
            NIVEL 2: recortes (quando/quem), agrupados numa faixa propria para
            nao competirem com a busca. Filtro ligado acende em indigo. */}
        <div className="sem-impressao mb-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar empresa, CNPJ, NF, OS ou vendedor"
                className={`input pl-9 ${busca ? "border-brand-300 bg-brand-50/40" : ""}`}
                aria-label="Buscar empresa"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <label className="label-filtro" htmlFor="ordem-titulos">
                Ordenar por
              </label>
              <select
                id="ordem-titulos"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
                className={`filtro font-display ${ordem !== "recentes" ? "filtro-ativo" : ""}`}
              >
                <option value="valor">Maior valor</option>
                <option value="recentes">Vencimento mais recente</option>
                <option value="antigos">Vencimento mais antigo</option>
                <option value="atraso">Maior atraso</option>
              </select>
            </div>
          </div>

          {/* A CARTEIRA DE CADA VENDEDOR, A UM CLIQUE.
              O filtro por vendedor já existia — dentro de um seletor, escondido
              atrás de outro filtro. Cobrar é conversa por pessoa ("Barbara, o
              que travou nesses três?"), e para isso o caminho tem de ser um
              clique, não abrir uma lista e procurar. O valor vem junto porque é
              ele que decide por quem começar, não a quantidade. */}
          {opcoesVendedor.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setVendedorSel("")}
                aria-pressed={!vendedorSel}
                className={`h-9 whitespace-nowrap rounded-full border px-3.5 font-display text-sm font-medium transition-all ${
                  !vendedorSel
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Todos
              </button>
              {opcoesVendedor.map((v) => {
                const aberto = vendedorSel === v.nome;
                return (
                  <button
                    key={v.nome}
                    type="button"
                    // Clicar de novo no mesmo tira o filtro: sem isso a saída é
                    // procurar o "Todos", e a pessoa acha que travou.
                    onClick={() => setVendedorSel(aberto ? "" : v.nome)}
                    aria-pressed={aberto}
                    title={`${v.qtd ?? 0} título(s) atrasado(s) — ${moeda(v.valor)}`}
                    className={`h-9 whitespace-nowrap rounded-full border px-3.5 font-display text-sm font-medium transition-all ${
                      aberto
                        ? "border-brand bg-brand text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {v.nome}
                    <span className={`ml-1.5 font-normal ${aberto ? "text-white/80" : "text-slate-400"}`}>
                      {moeda(v.valor)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-slate-50/70 px-3 py-2.5"
            style={{ borderColor: "var(--hairline)" }}
          >
            {/* O QUE mostrar. Estava no cabecalho, espremido contra o titulo, e
                "Acima de X dias" quebrava em tres linhas. Aqui embaixo, junto
                dos outros recortes, cabe e faz sentido: e um filtro tambem. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {opcoesFiltro.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => setFiltro(o.valor)}
                  aria-pressed={filtro === o.valor}
                  className={`h-9 whitespace-nowrap rounded-lg border px-3 font-display text-sm font-medium transition-all ${
                    filtro === o.valor
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-transparent text-slate-500 hover:bg-white hover:text-slate-800"
                  }`}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>

            <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />

            {/* QUANDO venceu */}
            <div className="flex items-center gap-2">
              <label className="label-filtro" htmlFor="ano-titulos">
                Ano
              </label>
              <select
                id="ano-titulos"
                value={anoSel}
                onChange={(e) => setAnoSel(e.target.value)}
                className={`filtro ${anoSel ? "filtro-ativo" : ""}`}
              >
                <option value="">Todos</option>
                {anosDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <label className="label-filtro ml-1" htmlFor="mes-titulos">
                Mês
              </label>
              <select
                id="mes-titulos"
                value={mesSel}
                onChange={(e) => setMesSel(e.target.value)}
                className={`filtro ${mesSel ? "filtro-ativo" : ""}`}
              >
                <option value="">Todos</option>
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />

            <div className="flex items-center gap-2">
              <label className="label-filtro" htmlFor="vence-de">
                Vencimento entre
              </label>
              <input
                id="vence-de"
                type="date"
                value={venceDe}
                onChange={(e) => setVenceDe(e.target.value)}
                className={`filtro ${venceDe ? "filtro-ativo" : ""}`}
                aria-label="Vencimento a partir de"
              />
              <span className="text-xs text-slate-400">e</span>
              <input
                type="date"
                value={venceAte}
                onChange={(e) => setVenceAte(e.target.value)}
                className={`filtro ${venceAte ? "filtro-ativo" : ""}`}
                aria-label="Vencimento até"
              />
            </div>

            {/* QUEM vendeu: isola a carteira de cobranca de cada vendedor.
                Aparece SEMPRE que existe vendedor — antes so com dois ou mais,
                e quem entrava numa conta ligada a vendedor ficava sem o seletor
                justamente na tela em que ele mais serve. */}
            {opcoesVendedor.length > 0 && (
              <>
                <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <label className="label-filtro" htmlFor="vendedor-titulos">
                    Vendedor
                  </label>
                  <select
                    id="vendedor-titulos"
                    value={vendedorSel}
                    onChange={(e) => setVendedorSel(e.target.value)}
                    className={`filtro ${vendedorSel ? "filtro-ativo" : ""}`}
                  >
                    <option value="">Todos</option>
                    {opcoesVendedor.map((v) => (
                      <option key={v.nome} value={v.nome}>
                        {v.nome} ({v.qtd ?? 0})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {filtro === "acima" && (
              <>
                <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <label className="label-filtro">Atraso a partir de</label>
                  <input
                    type="number"
                    min={1}
                    value={diasMin}
                    onChange={(e) => setDiasMin(e.target.value)}
                    className="filtro w-16"
                  />
                  <span className="text-xs text-slate-400">dias</span>
                </div>
              </>
            )}

            {temFiltro && (
              <button
                className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-display text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                onClick={limparTudo}
              >
                <X size={14} /> Limpar
              </button>
            )}
          </div>
        </div>

        {/* Resumo do que esta na tela (no papel isto ja esta no cabecalho). */}
        <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>
            Mostrando <strong className="tnum text-slate-900">{numero(titulosFiltrados.length)}</strong>{" "}
            de {numero(pediuPeriodo ? vm.titulos.length : vm.qtdAtivos)} títulos
            {titulosFiltrados.length > 0 && (
              <>
                {" "}
                · <strong className="tnum text-slate-900">{moeda(somaFiltrada)}</strong>
              </>
            )}
          </span>
          {faixaSel && (
            <button className="chip-warn" onClick={() => setFaixaSel(null)}>
              idade: {faixaSel.faixa} <X size={12} />
            </button>
          )}
          {(venceDe || venceAte) && (
            <button
              className="chip-warn"
              onClick={() => {
                setVenceDe("");
                setVenceAte("");
              }}
            >
              vencimento: {venceDe ? dataCurta(venceDe) : "início"} a{" "}
              {venceAte ? dataCurta(venceAte) : "hoje"} <X size={12} />
            </button>
          )}

          {/* Dinheiro que existe mas esta fora dos numeros: dito em voz alta e
              a um clique de distancia. Esconder sem avisar seria mentir. */}
          {vm.antigas.qtd > 0 &&
            (pediuPeriodo ? (
              <span className="chip-warn">
                incluindo divida de {vm.antigas.anos.join(", ")} (fora do total do painel)
              </span>
            ) : (
              <button
                className="chip"
                onClick={() => setAnoSel(vm.antigas.anos[vm.antigas.anos.length - 1])}
                title={`Ver a divida de ${vm.antigas.anos.join(", ")}`}
              >
                + {numero(vm.antigas.qtd)} títulos antigos ({moeda(vm.antigas.valor)}) fora da soma
              </button>
            ))}
        </div>

        {titulosFiltrados.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">Cliente</th>
                  <th className="th text-right">Valor</th>
                  <th className="th text-right">Atraso</th>
                  <th className="th text-left">Motivo</th>
                  <th className="th text-left">Próxima ação</th>
                  <th className="th text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {titulosFiltrados.map((t) => {
                  const aberto = expandido === t.id;
                  return (
                    <Fragment key={t.id}>
                      {/* Linha: separada por hairline (nao por caixa), com a
                          aberta marcada por uma faixa indigo na borda esquerda
                          -- da para saber onde se esta sem procurar a seta. */}
                      <tr
                        onClick={() => setExpandido(aberto ? null : t.id)}
                        className={`cursor-pointer border-t transition-colors ${
                          aberto ? "bg-brand-50/40" : "hover:bg-slate-50"
                        }`}
                        style={{
                          borderColor: "var(--hairline)",
                          boxShadow: aberto ? "inset 3px 0 0 0 var(--tw-shadow-color, #3840E8)" : undefined,
                        }}
                        aria-expanded={aberto}
                      >
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={16}
                              strokeWidth={2.4}
                              className={`shrink-0 text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`}
                            />
                            <span className="font-display font-medium text-slate-900">
                              {t.cliente}
                            </span>
                            {t.reincidente && (
                              <span className="chip chip-warn shrink-0">reincidente</span>
                            )}
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 pl-6 text-xs text-slate-500">
                            <span>
                              NF {t.nf || "-"}, OS {t.os || "-"}
                            </span>
                            {/* Quem vendeu: e por quem a cobranca comeca. Fica
                                clicavel para isolar a carteira do vendedor. */}
                            {t.vendedor ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVendedorSel(
                                    vendedorSel === t.vendedores[0] ? "" : t.vendedores[0]
                                  );
                                }}
                                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 transition-colors hover:bg-brand-100"
                                title={`Ver só os títulos de ${t.vendedor}`}
                              >
                                <User size={11} strokeWidth={2.4} />
                                {t.vendedor}
                              </button>
                            ) : (
                              <span className="text-slate-400">· vendedor não localizado</span>
                            )}
                            {/* O chip acima e um <button> e some na impressao;
                                sem isto o vendedor -- o dado que faz o PDF de
                                cobranca valer -- nao sairia no papel. */}
                            {t.vendedor && (
                              <span className="apenas-impressao">· vendedor: {t.vendedor}</span>
                            )}
                          </p>
                        </td>
                        <td className="td text-right tnum font-semibold text-slate-900">
                          {moeda(t.valor)}
                        </td>
                        {/* Atraso com peso visual: em cobranca, 15 dias e 300
                            dias sao problemas diferentes e a tabela precisa
                            gritar isso sem o gestor ler numero por numero. */}
                        <td className="td text-right">
                          <span
                            className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 tnum text-sm font-semibold ${
                              t.dias >= 90
                                ? "bg-bad-50 text-bad-700"
                                : t.dias >= 30
                                  ? "bg-warn-50 text-warn-700"
                                  : "text-slate-600"
                            }`}
                          >
                            {numero(t.dias)} dias
                          </span>
                        </td>
                        {/* Motivo: select sem moldura. Com borda em toda linha
                            viravam 83 caixas empilhadas competindo com o dado;
                            a moldura so aparece ao passar o mouse ou focar.
                            Quando ha motivo, o texto escurece para mostrar que
                            aquela linha ja foi classificada. */}
                        <td className="td" onClick={(e) => e.stopPropagation()}>
                          <select
                            className={`input-quieto font-display ${
                              t.motivoId ? "font-medium text-slate-800" : "text-slate-400"
                            }`}
                            value={t.motivoId || ""}
                            onChange={(e) =>
                              setOverrideRecebivel(t.id, { motivoId: e.target.value || null })
                            }
                            aria-label={`Motivo do atraso de ${t.cliente}`}
                          >
                            <option value="">Sem motivo</option>
                            {(config.motivosAtraso || []).map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nome}
                              </option>
                            ))}
                          </select>
                          {/* No papel o <select> some; o motivo vira texto. */}
                          <span className="apenas-impressao">{t.motivoNome}</span>
                        </td>
                        <td className="td text-sm text-slate-500">{t.proximaAcao}</td>
                        <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                          {/* No papel o botao some; sobra a situacao, que e o
                              que interessa a quem vai cobrar com a lista na
                              mao: ja falei com este cliente ou nao? */}
                          {!t.cobrado && <span className="apenas-impressao">a cobrar</span>}
                          {t.cobrado ? (
                            <span className="chip chip-ok inline-flex items-center gap-1">
                              <CheckCircle2 size={13} strokeWidth={2.4} />
                              Cobrado
                            </span>
                          ) : (
                            <button
                              className="sem-impressao inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2.5 font-display text-sm font-medium text-slate-500 transition-all duration-150 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                              onClick={() => setOverrideRecebivel(t.id, { cobrado: true })}
                            >
                              <CheckCircle2 size={14} strokeWidth={2.2} />
                              Marcar cobrado
                            </button>
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
                                <Detalhe rotulo="CNPJ / CPF" valor={t.cnpj || "nao informado"} />
                                <Detalhe rotulo="Nota fiscal" valor={t.nf || "sem NF"} />
                                <Detalhe rotulo="Ordem de serviço" valor={t.os || "sem OS"} />
                                <Detalhe
                                  rotulo={t.vendedores.length > 1 ? "Vendedores" : "Vendedor"}
                                  valor={t.vendedor || "nao localizado (OS de outro ano)"}
                                />
                                <Detalhe
                                  rotulo="Emissão"
                                  valor={t.emissao ? dataLonga(t.emissao) : "nao informada"}
                                />
                                <Detalhe
                                  rotulo="Vencimento"
                                  valor={t.vencimento ? dataLonga(t.vencimento) : "nao informado"}
                                />
                                <Detalhe rotulo="Atraso" valor={`${numero(t.dias)} dias`} />
                                <Detalhe rotulo="Classificação" valor={t.grupoNome} />
                                <Detalhe rotulo="Motivo" valor={t.motivoNome} />
                                <Detalhe
                                  rotulo="Situação"
                                  valor={t.cobrado ? "ja cobrado" : "pendente de cobranca"}
                                />
                              </dl>
                              <div
                                className="mt-3 border-t pt-3"
                                style={{ borderColor: "var(--hairline)" }}
                              >
                                <p className="label mb-1">Próxima ação sugerida</p>
                                <p className="flex items-center gap-2 text-sm text-slate-700">
                                  <Phone size={14} strokeWidth={2.2} className="text-brand" />
                                  {t.proximaAcao}
                                </p>
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
        ) : (
          <Empty>
            Nenhum título neste filtro.
            {temFiltro && (
              <button className="btn-ghost ml-2" onClick={limparTudo}>
                Limpar filtros
              </button>
            )}
          </Empty>
        )}
      </Card>

      {/* Onde a divida esta: mesmo recorte da lista acima, visto por tres
          angulos. Clicar numa barra filtra a lista (ano/mes) ou busca o
          cliente, para o gestor ir do "onde" direto para o "quem". */}
      <Card>
        <SectionTitle
          titulo="Onde esta a divida"
          sub={`${numero(titulosFiltrados.length)} títulos no recorte atual - ${moeda(
            somaFiltrada
          )}. Clique numa barra para filtrar.`}
          acao={
            <Segmented
              opcoes={[
                { valor: "ano", rotulo: "Por ano" },
                { valor: "mes", rotulo: "Por mês" },
                { valor: "cliente", rotulo: "Por cliente" },
              ]}
              valor={visao}
              onChange={setVisao}
            />
          }
        />
        {dividas[visao === "ano" ? "porAno" : visao === "mes" ? "porMes" : "porCliente"].length ? (
          <div className="space-y-4">
            {(() => {
              const lista =
                visao === "ano"
                  ? dividas.porAno
                  : visao === "mes"
                    ? dividas.porMes
                    : dividas.porCliente.slice(0, 12);
              const maior = Math.max(...lista.map((x) => x.valor), 1);
              const rotulo = (x) => (visao === "mes" ? rotuloMes(x.chave) : x.chave);
              return lista.map((x) => (
                <button
                  key={x.chave}
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    if (visao === "ano") {
                      setAnoSel(anoSel === x.chave ? "" : x.chave);
                      setMesSel("");
                    } else if (visao === "mes") {
                      setAnoSel(x.chave.slice(0, 4));
                      setMesSel(mesSel === x.chave.slice(5, 7) ? "" : x.chave.slice(5, 7));
                    } else {
                      setBusca(busca === x.chave ? "" : x.chave);
                    }
                    irParaTitulos();
                  }}
                  title={
                    visao === "cliente"
                      ? `Buscar ${x.chave} na lista`
                      : `Filtrar a lista por ${rotulo(x)}`
                  }
                >
                  <BarRow
                    rotulo={rotulo(x)}
                    valorTexto={moeda(x.valor)}
                    pct={Math.round((x.valor / maior) * 100)}
                    tom={x.dias >= 90 ? "bad" : x.dias >= 30 ? "warn" : "brand"}
                    sub={`${numero(x.qtd)} ${x.qtd === 1 ? "título" : "títulos"} - atraso até ${numero(x.dias)} dias`}
                  />
                </button>
              ));
            })()}
            {visao === "cliente" && dividas.porCliente.length > 12 && (
              <p className="text-xs text-slate-500">
                Mostrando os 12 maiores de {numero(dividas.porCliente.length)} clientes.
              </p>
            )}
          </div>
        ) : (
          <Empty>Nenhum título no recorte atual.</Empty>
        )}
      </Card>

      {/* Ranking de quem mais deve: a fila de cobranca, na ordem. */}
      <Card>
        <SectionTitle
          titulo="Ranking de devedores"
          sub="Quem mais deve no recorte atual, com o vendedor que atendeu."
        />
        {dividas.porCliente.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">#</th>
                  <th className="th text-left">Cliente</th>
                  <th className="th text-right">Devendo</th>
                  <th className="th text-right">Títulos</th>
                  <th className="th text-right">Maior atraso</th>
                  <th className="th text-left">Vendedor</th>
                </tr>
              </thead>
              <tbody>
                {dividas.porCliente.slice(0, 15).map((c, i) => {
                  const vends = [
                    ...new Set(
                      titulosFiltrados
                        .filter((t) => t.cliente === c.chave)
                        .flatMap((t) => t.vendedores)
                    ),
                  ];
                  return (
                    <tr
                      key={c.chave}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => {
                        setBusca(c.chave);
                        irParaTitulos();
                      }}
                      title={`Ver os títulos de ${c.chave}`}
                    >
                      <td className="td tnum text-slate-400">{i + 1}</td>
                      <td className="td font-display font-medium text-slate-900">{c.chave}</td>
                      <td className="td text-right tnum font-semibold text-slate-900">
                        {moeda(c.valor)}
                      </td>
                      <td className="td text-right tnum text-slate-600">{numero(c.qtd)}</td>
                      <td className="td text-right">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 tnum text-sm font-semibold ${
                            c.dias >= 90
                              ? "bg-bad-50 text-bad-700"
                              : c.dias >= 30
                                ? "bg-warn-50 text-warn-700"
                                : "text-slate-600"
                          }`}
                        >
                          {numero(c.dias)} dias
                        </span>
                      </td>
                      <td className="td text-sm text-slate-600">
                        {vends.length ? vends.join(", ") : "não localizado"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhum devedor no recorte atual.</Empty>
        )}
      </Card>

      {/* Por que estao atrasados */}
      <Card>
        <SectionTitle
          titulo="Por que estão atrasados"
          sub="Distribuição do valor por origem da causa."
        />
        {vm.porOrigem.some((o) => o.valor > 0) ? (
          <div className="space-y-4">
            {vm.porOrigem.map((o) => (
              <BarRow
                key={o.grupo}
                rotulo={o.nome}
                valorTexto={moeda(o.valor)}
                pct={o.pct}
                tom={tomDoGrupo(o.grupo)}
                sub={`${o.pct}% do total`}
              />
            ))}
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-display text-sm font-semibold text-slate-900">
                {vm.resumoOrigem}
              </p>
            </div>
          </div>
        ) : (
          <Empty>Nada classificado por origem ainda.</Empty>
        )}
      </Card>

      {/* Padroes por motivo */}
      <Card>
        <SectionTitle
          titulo="Padrões por motivo"
          sub="O que mais trava o recebimento, por valor."
        />
        {vm.porMotivo.length ? (
          <div className="space-y-4">
            {vm.porMotivo.map((m) => (
              <BarRow
                key={m.motivoId || "sem"}
                rotulo={m.nome}
                valorTexto={moeda(m.valor)}
                pct={k.totalAtrasado ? Math.round((m.valor / k.totalAtrasado) * 100) : 0}
                tom={tomDoGrupo(m.grupo)}
                sub={`${numero(m.qtd)} ${m.qtd === 1 ? "título" : "títulos"}`}
              />
            ))}
          </div>
        ) : (
          <Empty>Sem motivos registrados.</Empty>
        )}
      </Card>

      {/* Idade dos atrasos: cada faixa e um filtro clicavel */}
      <Card>
        <SectionTitle
          titulo="Idade dos atrasos"
          sub="Quanto mais velho o atraso, mais difícil recuperar. Clique numa faixa para ver os títulos."
        />
        {vm.idade.some((f) => f.qtd > 0) ? (
          <div className="space-y-2">
            {vm.idade.map((f) => {
              const maxValor = Math.max(...vm.idade.map((x) => x.valor), 1);
              const sel = faixaSel?.faixa === f.faixa;
              return (
                <button
                  key={f.faixa}
                  disabled={f.qtd === 0}
                  onClick={() => {
                    setFaixaSel(sel ? null : f);
                    setFiltro("todos");
                    irParaTitulos();
                  }}
                  className={`w-full rounded-xl p-2 text-left transition-colors disabled:cursor-default disabled:opacity-60 ${
                    sel ? "bg-brand/5 ring-1 ring-brand/40" : f.qtd > 0 ? "hover:bg-slate-50" : ""
                  }`}
                >
                  <BarRow
                    rotulo={f.faixa}
                    valorTexto={moeda(f.valor)}
                    pct={Math.round((f.valor / maxValor) * 100)}
                    tom={f.alto ? "bad" : "brand"}
                    sub={`${numero(f.qtd)} ${f.qtd === 1 ? "título" : "títulos"}`}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty>Nenhum título atrasado.</Empty>
        )}
      </Card>

      {/* Plano de acao */}
      <section>
        <SectionTitle
          titulo="Plano de ação"
          sub="Quatro frentes, cada uma com um próximo passo claro."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {vm.frentes.map((f) => {
            const vazia = f.soma === 0 && f.qtd === 0;
            return (
              <Card key={f.chave} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {f.titulo}
                  </h3>
                  <span className="chip shrink-0">{f.prazo}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{f.descricao}</p>

                {vazia ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-ok-700">
                    <CheckCircle2 size={18} strokeWidth={2.2} />
                    Nada nesta frente.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="kpi-value text-2xl text-slate-900">{moeda(f.soma)}</span>
                      <span className="mb-1 text-sm text-slate-500">
                        {numero(f.qtd)} {f.qtd === 1 ? "título" : "títulos"}
                      </span>
                    </div>
                    {f.clientes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {f.clientes.slice(0, 6).map((c) => (
                          <button
                            key={c}
                            className="chip transition-colors hover:bg-slate-200"
                            onClick={() => {
                              limparTudo();
                              setBusca(c);
                              irParaTitulos();
                            }}
                            title="Ver os títulos deste cliente"
                          >
                            {c}
                          </button>
                        ))}
                        {f.clientes.length > 6 && (
                          <span className="chip">+{f.clientes.length - 6}</span>
                        )}
                      </div>
                    )}
                    <p
                      className="mt-3 border-t pt-3 text-sm text-slate-600"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {f.nota}
                    </p>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Cobrar hoje */}
      <Card>
        <SectionTitle
          titulo="Cobrar hoje"
          sub="Os pendentes de maior valor, com a ação sugerida."
        />
        {vm.cobrarHoje.length ? (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {vm.cobrarHoje.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <button
                    className="font-display text-sm font-semibold text-slate-900 hover:text-brand"
                    onClick={() => {
                      limparTudo();
                      setBusca(c.cliente);
                      setExpandido(c.id);
                      irParaTitulos();
                    }}
                    title="Ver este título na lista"
                  >
                    {c.cliente}
                  </button>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <Phone size={14} strokeWidth={2.2} className="text-brand" />
                    {c.acao}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-sm font-semibold text-slate-900">{moeda(c.valor)}</p>
                  <p className="text-xs text-slate-500">{numero(c.dias)} dias</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma cobrança pendente. Tudo em dia.</Empty>
        )}
      </Card>

      {/* Curva do DSO: so com historico REAL acumulado no cache (um ponto/dia). */}
      {vm.dsoHistorico.length >= 2 ? (
        <Card>
          <SectionTitle
            titulo="Curva do DSO"
            sub="Prazo medio de recebimento ao longo dos dias, contra a meta."
          />
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={vm.dsoHistorico} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(v) => [`${v} dias`, "DSO"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <ReferenceLine
                  y={k.dsoMeta}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: "meta", position: "right", fontSize: 11, fill: "#94a3b8" }}
                />
                <Line
                  type="monotone"
                  dataKey="dso"
                  stroke={MARCA}
                  strokeWidth={2.4}
                  dot={{ r: 3, fill: MARCA }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : (
        <Card>
          <SectionTitle titulo="Curva do DSO" sub="Prazo medio de recebimento ao longo do tempo." />
          <Empty>
            O histórico de DSO começa a ser registrado agora, um ponto por dia. A curva aparece
            assim que houver alguns dias acumulados.
          </Empty>
        </Card>
      )}
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
