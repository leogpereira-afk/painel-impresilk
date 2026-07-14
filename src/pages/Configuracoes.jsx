// Modulo 5: Configuracoes. O coracao do controle. Tudo aqui e editavel e salva
// sozinho (o store persiste). Cada mudanca recalcula os outros modulos ao vivo.
// So consome config + updateConfig + resetarConfig. Sem dados, sem calc.

import { Plus, Trash2, Info } from "lucide-react";
import { useApp } from "../config/store.jsx";
import { Card, PageTitle, SectionTitle, Segmented } from "../components/ui.jsx";

// Rotulo + campo, para manter o espacamento uniforme em todos os grids.
function Campo({ rotulo, dica, children }) {
  return (
    <label className="block">
      <span className="label">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-400">{dica}</span>}
    </label>
  );
}

// Botao de remover linha, discreto e vermelho no hover.
function BotaoRemover({ onClick, titulo = "Remover" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-bad-50 hover:text-bad-600"
    >
      <Trash2 size={16} strokeWidth={2.2} />
    </button>
  );
}

const TAGS_MOTIVO = [
  { valor: "", rotulo: "Sem tag" },
  { valor: "semContato", rotulo: "Sem contato" },
  { valor: "esquecimento", rotulo: "Esquecimento" },
  { valor: "disputa", rotulo: "Disputa" },
  { valor: "nfNaoEnviada", rotulo: "NF nao enviada" },
];

export default function Configuracoes() {
  const { config, updateConfig, resetarConfig } = useApp();

  const p = config.parametros;
  const setParam = (chave, valor) =>
    updateConfig((c) => {
      c.parametros[chave] = valor;
      return c;
    });
  const setParamNum = (chave) => (e) => setParam(chave, Number(e.target.value));

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Configuracoes"
        descricao="Todas as regras do painel vivem aqui. Cada mudanca recalcula os modulos na hora."
        acao={
          <button className="btn-outline" onClick={resetarConfig}>
            Restaurar padrao
          </button>
        }
      />

      {/* 2. Parametros gerais */}
      <Card>
        <SectionTitle
          titulo="Parametros gerais"
          sub="Os limites e metas que alimentam os alertas dos modulos."
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Colchao minimo de caixa (R$)">
            <input
              type="number"
              className="input tnum"
              value={p.colchaoMinimo}
              onChange={setParamNum("colchaoMinimo")}
            />
          </Campo>
          <Campo rotulo="DSO meta (dias)">
            <input
              type="number"
              className="input tnum"
              value={p.dsoMeta}
              onChange={setParamNum("dsoMeta")}
            />
          </Campo>
          <Campo rotulo="DSO de alerta (dias)">
            <input
              type="number"
              className="input tnum"
              value={p.dsoAlerta}
              onChange={setParamNum("dsoAlerta")}
            />
          </Campo>
          <Campo rotulo="Valor minimo de orcamento (R$)">
            <input
              type="number"
              className="input tnum"
              value={p.valorMinimoOrcamento}
              onChange={setParamNum("valorMinimoOrcamento")}
            />
          </Campo>
          <Campo
            rotulo="Data de corte dos orcamentos"
            dica="Considera orcamentos a partir desta data."
          >
            <input
              type="date"
              className="input tnum"
              value={p.dataCorteOrcamentos}
              onChange={(e) => setParam("dataCorteOrcamentos", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Orcamento parado apos (dias)">
            <input
              type="number"
              className="input tnum"
              value={p.diasParado}
              onChange={setParamNum("diasParado")}
            />
          </Campo>
          <Campo
            rotulo="Vira escalada apos (dias)"
            dica="Sem contato acima disso vira escalada."
          >
            <input
              type="number"
              className="input tnum"
              value={p.diasEscala}
              onChange={setParamNum("diasEscala")}
            />
          </Campo>
        </div>

        {/* Saldo inicial */}
        <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="label mb-1">Saldo inicial do fluxo de caixa</p>
              <p className="text-sm text-slate-500">
                Use a soma das contas bancarias do Mubi ou informe um valor manual.
              </p>
            </div>
            <Segmented
              opcoes={[
                { valor: "mubi", rotulo: "Contas do Mubi" },
                { valor: "manual", rotulo: "Valor manual" },
              ]}
              valor={p.saldoInicialModo}
              onChange={(v) => setParam("saldoInicialModo", v)}
            />
          </div>
          {p.saldoInicialModo === "manual" && (
            <div className="mt-4 max-w-xs">
              <Campo rotulo="Saldo inicial manual (R$)">
                <input
                  type="number"
                  className="input tnum"
                  value={p.saldoInicialManual}
                  onChange={setParamNum("saldoInicialManual")}
                />
              </Campo>
            </div>
          )}
        </div>
      </Card>

      {/* 3. Motivos de atraso */}
      <Card>
        <SectionTitle
          titulo="Motivos de atraso"
          sub="A causa de cada titulo em aberto. O grupo define se a falha e sua ou do cliente."
        />

        {/* Renomear os tres grupos de causa (o id nao muda, so o nome). */}
        <div className="grid gap-4 sm:grid-cols-3">
          {config.gruposCausa.map((g, i) => (
            <Campo key={g.id} rotulo={`Grupo ${i + 1}`}>
              <input
                className="input"
                value={g.nome}
                onChange={(e) =>
                  updateConfig((c) => {
                    c.gruposCausa[i].nome = e.target.value;
                    return c;
                  })
                }
              />
            </Campo>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {config.motivosAtraso.map((m, i) => (
            <div
              key={m.id}
              className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
              style={{ borderColor: "var(--hairline)" }}
            >
              <input
                className="input"
                value={m.nome}
                placeholder="Nome do motivo"
                onChange={(e) =>
                  updateConfig((c) => {
                    c.motivosAtraso[i].nome = e.target.value;
                    return c;
                  })
                }
              />
              <div className="flex items-center gap-3">
                <select
                  className="select flex-1"
                  value={m.grupo}
                  onChange={(e) =>
                    updateConfig((c) => {
                      c.motivosAtraso[i].grupo = e.target.value;
                      return c;
                    })
                  }
                >
                  {config.gruposCausa.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
                <select
                  className="select flex-1"
                  value={m.tag || ""}
                  onChange={(e) =>
                    updateConfig((c) => {
                      c.motivosAtraso[i].tag = e.target.value || null;
                      return c;
                    })
                  }
                >
                  {TAGS_MOTIVO.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
                <BotaoRemover
                  onClick={() =>
                    updateConfig((c) => {
                      c.motivosAtraso.splice(i, 1);
                      return c;
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn-ghost mt-4"
          onClick={() =>
            updateConfig((c) => {
              c.motivosAtraso.push({
                id: "m-" + Date.now(),
                nome: "",
                grupo: "cliente",
                tag: null,
              });
              return c;
            })
          }
        >
          <Plus size={16} strokeWidth={2.4} />
          Adicionar motivo
        </button>
      </Card>

      {/* 4. Regua de cobranca e proxima acao */}
      <Card>
        <SectionTitle
          titulo="Regua de cobranca e proxima acao"
          sub="A acao sugerida cresce conforme os dias de atraso."
        />

        <div className="space-y-3">
          {config.reguaCobranca.map((f, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-center"
            >
              <div>
                <span className="label sm:hidden">Ate quantos dias</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="input tnum"
                    value={f.ateDias}
                    onChange={(e) =>
                      updateConfig((c) => {
                        c.reguaCobranca[i].ateDias = Number(e.target.value);
                        return c;
                      })
                    }
                  />
                  <span className="shrink-0 text-sm text-slate-400">dias</span>
                </div>
              </div>
              <input
                className="input"
                value={f.acao}
                placeholder="Acao sugerida"
                onChange={(e) =>
                  updateConfig((c) => {
                    c.reguaCobranca[i].acao = e.target.value;
                    return c;
                  })
                }
              />
              <BotaoRemover
                onClick={() =>
                  updateConfig((c) => {
                    c.reguaCobranca.splice(i, 1);
                    return c;
                  })
                }
              />
            </div>
          ))}
        </div>

        <button
          className="btn-ghost mt-4"
          onClick={() =>
            updateConfig((c) => {
              c.reguaCobranca.push({ ateDias: 0, acao: "" });
              return c;
            })
          }
        >
          <Plus size={16} strokeWidth={2.4} />
          Adicionar faixa
        </button>

        {/* Regras por motivo */}
        <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--hairline)" }}>
          <SectionTitle
            titulo="Regras por motivo"
            sub="Sobrepoem a regua quando o motivo do titulo casa."
          />
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-brand/5 px-3 py-2 text-sm text-slate-600">
            <Info size={16} className="mt-0.5 shrink-0 text-brand" strokeWidth={2.2} />
            A regra por motivo sempre vence a regua de dias.
          </p>

          <div className="space-y-3">
            {config.regrasPorMotivo.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
              >
                <select
                  className="select"
                  value={r.motivoId}
                  onChange={(e) =>
                    updateConfig((c) => {
                      c.regrasPorMotivo[i].motivoId = e.target.value;
                      return c;
                    })
                  }
                >
                  {config.motivosAtraso.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome || "Sem nome"}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  value={r.acao}
                  placeholder="Acao que vence a regua"
                  onChange={(e) =>
                    updateConfig((c) => {
                      c.regrasPorMotivo[i].acao = e.target.value;
                      return c;
                    })
                  }
                />
                <BotaoRemover
                  onClick={() =>
                    updateConfig((c) => {
                      c.regrasPorMotivo.splice(i, 1);
                      return c;
                    })
                  }
                />
              </div>
            ))}
          </div>

          <button
            className="btn-ghost mt-4"
            onClick={() =>
              updateConfig((c) => {
                const primeiro = c.motivosAtraso[0];
                c.regrasPorMotivo.push({
                  motivoId: primeiro ? primeiro.id : "",
                  acao: "",
                });
                return c;
              })
            }
          >
            <Plus size={16} strokeWidth={2.4} />
            Adicionar regra por motivo
          </button>
        </div>
      </Card>

      {/* 5. Faixas de idade dos atrasos */}
      <Card>
        <SectionTitle
          titulo="Faixas de idade dos atrasos"
          sub="Os limites em dias que agrupam os titulos por tempo de atraso."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {config.faixasIdade.map((v, i) => (
            <Campo key={i} rotulo={`Faixa ${i + 1} (ate dias)`}>
              <input
                type="number"
                className="input tnum"
                value={v}
                onChange={(e) =>
                  updateConfig((c) => {
                    c.faixasIdade[i] = Number(e.target.value);
                    return c;
                  })
                }
              />
            </Campo>
          ))}
        </div>
      </Card>

      {/* 6. Vendedores */}
      <Card>
        <SectionTitle
          titulo="Vendedores"
          sub="O time que aparece no funil de orcamentos."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {config.vendedores.map((v, i) => (
            <div key={v.id} className="flex items-center gap-2">
              <input
                className="input"
                value={v.nome}
                placeholder="Nome do vendedor"
                onChange={(e) =>
                  updateConfig((c) => {
                    c.vendedores[i].nome = e.target.value;
                    return c;
                  })
                }
              />
              <BotaoRemover
                onClick={() =>
                  updateConfig((c) => {
                    c.vendedores.splice(i, 1);
                    return c;
                  })
                }
              />
            </div>
          ))}
        </div>
        <button
          className="btn-ghost mt-4"
          onClick={() =>
            updateConfig((c) => {
              c.vendedores.push({ id: "v-" + Date.now(), nome: "" });
              return c;
            })
          }
        >
          <Plus size={16} strokeWidth={2.4} />
          Adicionar vendedor
        </button>
      </Card>

      {/* 7. Motivos de perda de orcamento */}
      <Card>
        <SectionTitle
          titulo="Motivos de perda de orcamento"
          sub="As razoes possiveis quando um orcamento nao fecha."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {config.motivosPerda.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2">
              <input
                className="input"
                value={m.nome}
                placeholder="Motivo da perda"
                onChange={(e) =>
                  updateConfig((c) => {
                    c.motivosPerda[i].nome = e.target.value;
                    return c;
                  })
                }
              />
              <BotaoRemover
                onClick={() =>
                  updateConfig((c) => {
                    c.motivosPerda.splice(i, 1);
                    return c;
                  })
                }
              />
            </div>
          ))}
        </div>
        <button
          className="btn-ghost mt-4"
          onClick={() =>
            updateConfig((c) => {
              c.motivosPerda.push({ id: "mp-" + Date.now(), nome: "" });
              return c;
            })
          }
        >
          <Plus size={16} strokeWidth={2.4} />
          Adicionar motivo de perda
        </button>
      </Card>
    </div>
  );
}
