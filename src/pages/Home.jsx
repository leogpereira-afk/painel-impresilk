// Home: o que exige atencao HOJE, em linhas.
//
// Os quatro cartoes grandes sairam: eles eram navegacao E numero, e a barra
// lateral agora faz os dois de qualquer tela (ver components/Layout.jsx). O que
// na lateral NAO cabe e o porque -- "11 dias abaixo do colchao", "lider em
// queda" -- e e isso que sobrou aqui: o alerta, nao o atalho.
//
// A ordem nao e fixa: o que esta pior sobe. Numa manha corrida, a primeira
// linha e a que precisa de decisao.

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Wallet, Package, FileText, ChevronRight } from "lucide-react";
import { useApp } from "../config/store.jsx";
import { calcContasAtrasadas } from "../lib/calc/contasAtrasadas.js";
import { calcFluxoCaixa } from "../lib/calc/fluxoCaixa.js";
import { calcProdutos } from "../lib/calc/produtos.js";
import { calcOrcamentos } from "../lib/calc/orcamentos.js";
import { moeda, numero, pct } from "../lib/format.js";
import { CarregandoModulo, ErroModulo } from "../components/ui.jsx";

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const TOM = {
  bad: { ponto: "bg-bad-600", texto: "text-bad-700", borda: "border-bad-200" },
  warn: { ponto: "bg-warn-600", texto: "text-warn-700", borda: "border-warn-200" },
  ok: { ponto: "bg-ok-600", texto: "text-ok-700", borda: "border-transparent" },
};
const PESO = { bad: 0, warn: 1, ok: 2 };

export default function Home() {
  const { config, dados, overridesRecebiveis, overridesOrcamentos, pronto, erro, recarregar } =
    useApp();
  const navigate = useNavigate();

  const vm = useMemo(() => {
    if (!dados) return null;
    return {
      contas: calcContasAtrasadas(
        dados.recebiveis,
        overridesRecebiveis,
        config,
        dados.dsoHist,
        dados.ordens
      ),
      fluxo: calcFluxoCaixa(
        { pagar: dados.pagar, recebiveis: dados.recebiveis, bancos: dados.bancos },
        config
      ),
      produtos: calcProdutos(dados.ordens, dados.catalogo, config),
      orcamentos: calcOrcamentos(dados.orcamentos, overridesOrcamentos, config),
    };
  }, [dados, config, overridesRecebiveis, overridesOrcamentos]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const { contas, fluxo, produtos, orcamentos } = vm;
  const menor15 = fluxo.kpis.menorSaldo15;
  const abaixoColchao = menor15 < config.parametros.colchaoMinimo;
  const lider = produtos.lider;

  const linhas = [
    {
      icone: AlertTriangle,
      titulo: "Contas Atrasadas",
      tom: contas.kpis.totalAtrasado > 0 ? "bad" : "ok",
      frase:
        contas.kpis.totalAtrasado > 0
          ? `${moeda(contas.kpis.totalAtrasado)} em ${numero(contas.kpis.qtd)} titulos. Maior atraso: ${numero(contas.kpis.maiorAtrasoDias)} dias, ${contas.kpis.maiorAtrasoCliente}.`
          : "Nada atrasado.",
      to: "/contas-atrasadas",
    },
    {
      icone: Wallet,
      titulo: "Fluxo de Caixa",
      tom: abaixoColchao ? "bad" : "ok",
      frase: abaixoColchao
        ? `Menor saldo previsto de ${moeda(menor15)} em 15 dias, abaixo do colchao de ${moeda(fluxo.kpis.colchao)}. ${numero(fluxo.kpis.diasAbaixo)} dias no vermelho.`
        : `Caixa acima do colchao. Menor saldo previsto: ${moeda(menor15)}.`,
      to: "/fluxo-caixa",
    },
    {
      icone: Package,
      titulo: "Produtos",
      tom: produtos.liderEmQueda ? "bad" : "ok",
      frase: lider
        ? produtos.liderEmQueda
          ? `${lider.nome} lidera com ${moeda(lider.faturamento)}, mas caiu ${Math.abs(lider.varFat)}% desde janeiro.`
          : `${lider.nome} lidera com ${moeda(lider.faturamento)} no ano.`
        : "Sem faturamento no periodo.",
      to: "/produtos",
    },
    {
      icone: FileText,
      titulo: "Orcamentos",
      tom: orcamentos.kpis.conversao >= 40 ? "ok" : "warn",
      frase: `${moeda(orcamentos.kpis.naMesaValor)} na mesa em ${numero(orcamentos.kpis.naMesaQtd)} orcamentos. Conversao do time: ${pct(orcamentos.kpis.conversao)}.`,
      to: "/orcamentos",
    },
  ].sort((a, b) => PESO[a.tom] - PESO[b.tom]);

  const problemas = linhas.filter((l) => l.tom !== "ok").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {saudacao()}, aqui esta o resumo
        </h1>
        <p className="mt-1 text-slate-500">
          {problemas === 0
            ? "Nenhum ponto critico hoje."
            : problemas === 1
              ? "1 ponto exige sua atencao hoje."
              : `${problemas} pontos exigem sua atencao hoje.`}
        </p>
      </div>

      <div className="space-y-2">
        {linhas.map((l) => {
          const t = TOM[l.tom];
          return (
            <button
              key={l.titulo}
              onClick={() => navigate(l.to)}
              className={`card card-hover group flex w-full items-start gap-3 border-l-4 p-4 text-left sm:items-center ${t.borda}`}
            >
              <span className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 sm:mt-0 ${t.texto}`}>
                <l.icone size={18} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-slate-900">{l.titulo}</p>
                <p className={`mt-0.5 text-sm ${l.tom === "ok" ? "text-slate-500" : t.texto}`}>
                  {l.frase}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand sm:mt-0"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
