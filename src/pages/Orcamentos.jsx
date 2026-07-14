// Modulo 4: Orcamentos acima do valor minimo. Conversao do time, motivos de
// perda e orcamentos parados. Trocar o motivo de um perdido ou incluir/retirar
// vendedor recalcula a tela ao vivo (useMemo + overrides/config da fundacao).

import { useMemo, useState } from "react";
import { FileText, Percent, TrendingDown, Plus, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { useApp } from "../config/store.jsx";
import { calcOrcamentos } from "../lib/calc/orcamentos.js";
import { moeda, pct } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  BarRow,
  StatusLine,
  Empty,
  CarregandoModulo,
  ErroModulo,
} from "../components/ui.jsx";

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

  const vm = useMemo(
    () => (dados ? calcOrcamentos(dados.orcamentos, overridesOrcamentos, config) : null),
    [dados, overridesOrcamentos, config]
  );

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const k = vm.kpis;
  const motivos = config.motivosPerda || [];
  const maiorMotivo = vm.porMotivoPerda[0]?.valor || 0;

  function incluirVendedor() {
    const nome = novoVendedor.trim();
    if (!nome) return;
    updateConfig((c) => {
      c.vendedores.push({ id: "v-" + Date.now(), nome });
      return c;
    });
    setNovoVendedor("");
  }

  function retirarVendedor(id) {
    updateConfig((c) => {
      c.vendedores = c.vendedores.filter((v) => v.id !== id);
      return c;
    });
  }

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Orcamentos"
        descricao={
          "Acima de " +
          moeda(config.parametros.valorMinimoOrcamento) +
          ", desde " +
          dataLongaCorte(config.parametros.dataCorteOrcamentos) +
          "."
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          rotulo="Na mesa"
          valor={moeda(k.naMesaValor)}
          sub={k.naMesaQtd + " orcamentos aguardando"}
          tom="brand"
          icone={FileText}
        />
        <StatCard
          rotulo="Conversao do time"
          valor={pct(k.conversao)}
          sub={k.ganhosQtd + " ganhos, " + k.perdidosQtd + " perdidos"}
          tom={k.conversao >= 40 ? "ok" : "warn"}
          icone={Percent}
        />
        <StatCard
          rotulo="Valor perdido no periodo"
          valor={moeda(k.valorPerdido)}
          sub={k.perdidosQtd + " orcamentos que nao fecharam"}
          tom="bad"
          icone={TrendingDown}
        />
      </div>

      {/* Por vendedor */}
      <Card>
        <SectionTitle
          titulo="Por vendedor"
          sub="Quem esta convertendo. Ajuste a equipe abaixo, a tabela recalcula na hora."
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Nome do vendedor"
            value={novoVendedor}
            onChange={(e) => setNovoVendedor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") incluirVendedor();
            }}
          />
          <button
            className="btn-primary"
            onClick={incluirVendedor}
            disabled={!novoVendedor.trim()}
          >
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
                  return (
                    <tr key={v.vendedorId}>
                      <td className="td font-medium text-slate-900">{v.nome}</td>
                      <td className="td tnum text-right">{v.qtd}</td>
                      <td className="td tnum text-right">{moeda(v.valor)}</td>
                      <td className="td tnum text-right text-ok-700">{v.ganhos}</td>
                      <td className="td tnum text-right text-bad-700">{v.perdidos}</td>
                      <td className={"td tnum text-right font-semibold " + corConv}>
                        {semDados ? "-" : pct(v.conversao)}
                      </td>
                      <td className="td text-right">
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

      {/* Por que perdemos */}
      <Card>
        <SectionTitle titulo="Por que perdemos" sub="O valor deixado na mesa, por motivo." />

        {vm.porMotivoPerda.length === 0 ? (
          <Empty>Nenhuma perda registrada no periodo.</Empty>
        ) : (
          <>
            <div className="space-y-4">
              {vm.porMotivoPerda.map((m, i) => (
                <BarRow
                  key={m.motivoId || "sem"}
                  rotulo={m.nome}
                  valorTexto={moeda(m.valor)}
                  pct={maiorMotivo ? (m.valor / maiorMotivo) * 100 : 0}
                  tom={i === 0 ? "bad" : "warn"}
                  sub={m.qtd + (m.qtd === 1 ? " orcamento" : " orcamentos")}
                />
              ))}
            </div>

            {vm.motivoLider && (
              <div className="mt-5 rounded-xl bg-brand/5 p-4">
                <p className="label mb-1 text-brand">
                  Maior motivo: {vm.motivoLider.nome}
                </p>
                <p className="text-sm text-slate-700">{vm.acaoLider}</p>
              </div>
            )}
          </>
        )}

        {vm.perdidos.length > 0 && (
          <div className="mt-6">
            <p className="label mb-3">
              Marque o motivo de cada perda para afinar a analise
            </p>
            <div className="space-y-2">
              {vm.perdidos.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {o.cliente}
                    </p>
                    <p className="text-xs text-slate-500">Orcamento {o.numero}</p>
                  </div>
                  <span className="tnum text-sm font-semibold text-bad-700">
                    {moeda(o.valor)}
                  </span>
                  <select
                    className="select w-full sm:w-56"
                    value={o.motivoPerdaId || ""}
                    onChange={(e) =>
                      setOverrideOrcamento(o.id, { motivoPerdaId: e.target.value || null })
                    }
                  >
                    <option value="">Motivo nao informado</option>
                    {motivos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Orcamentos parados */}
      <Card>
        <SectionTitle
          titulo="Orcamentos parados"
          sub={
            "Enviados sem resposta ha mais de " +
            config.parametros.diasParado +
            " dias."
          }
        />

        {vm.parados.length === 0 ? (
          <Empty>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} className="text-ok-600" strokeWidth={2.4} />
              Nenhum orcamento parado. Follow-up em dia.
            </span>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">Orcamento</th>
                  <th className="th text-left">Cliente</th>
                  <th className="th text-left">Vendedor</th>
                  <th className="th text-right">Valor</th>
                  <th className="th text-right">Parado ha</th>
                </tr>
              </thead>
              <tbody>
                {vm.parados.map((o) => (
                  <tr key={o.id}>
                    <td className="td tnum text-slate-600">{o.numero}</td>
                    <td className="td font-medium text-slate-900">{o.cliente}</td>
                    <td className="td text-slate-600">{o.vendedorNome}</td>
                    <td className="td tnum text-right">{moeda(o.valor)}</td>
                    <td className="td text-right">
                      <StatusLine tom={o.dias >= 21 ? "bad" : "warn"}>
                        <span className="tnum inline-flex items-center gap-1">
                          <Clock size={13} strokeWidth={2.4} />
                          {o.dias} dias
                        </span>
                      </StatusLine>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
