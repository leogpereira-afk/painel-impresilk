// Modulo 5: Configuracoes. O coracao do controle. Tudo aqui e editavel e salva
// sozinho (o store persiste). Cada mudanca recalcula os outros modulos ao vivo.
// So consome config + updateConfig + resetarConfig. Sem dados, sem calc.
//
// DESDE 26/09/2026: grupos recolhiveis, FECHADOS por padrao e lembrados no
// aparelho (a tela tinha 5.644px com tudo aberto, mais de 9.000 no celular);
// um nivel de acordeao so; o estado de gravacao numa barra grudada no topo; e
// "Restaurar regras gerais" numa zona de cuidado no fim, e nao mais como o
// botao mais visivel do topo.

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, AlertTriangle, AlertCircle, Check, ChevronDown, Loader2 } from "lucide-react";
import { useApp } from "../config/store.jsx";
import { comCracha, podeAbrir } from "../lib/sessao.js";
import { API } from "../lib/api.js";
import { Segmented } from "../components/ui.jsx";
import { useLocation } from "react-router-dom";
import { ConfiguracaoPermutas, ConfiguracaoMarketing, ConfiguracaoCampanhas } from "../components/ConfiguracoesModulos.jsx";
import LixeiraRegistros from "../components/LixeiraRegistros.jsx";
import { Aviso, CabecalhoDaArea, sessaoDaArea } from "../components/AreaSistemas.jsx";
import "./configuracoes.css";

const CHAVE_GRUPOS = "painel_config_grupos";
function lerGrupos() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_GRUPOS) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}

// Um grupo que abre e fecha. O estado de CADA grupo e lembrado no aparelho.
function Grupo({ id, titulo, sub, aberto, aoAlternar, children }) {
  return (
    <details id={`config-${id}`} className="area-grupo rounded-2xl border bg-white" open={aberto}
      onToggle={(e) => aoAlternar(e.currentTarget.open)}>
      <summary className="flex min-h-16 cursor-pointer items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <p className="text-sm text-slate-500">{sub}</p>
        </div>
        <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-slate-400" />
      </summary>
      <div className="border-t px-4 py-5 sm:px-5">{children}</div>
    </details>
  );
}

// Uma subsecao dentro do grupo: um nivel de acordeao so.
function Sub({ titulo, sub, children }) {
  return (
    <section className="area-sub">
      <h3 className="text-base font-semibold text-slate-900">{titulo}</h3>
      {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Rotulo + campo, para manter o espacamento uniforme em todos os grids.
function Campo({ rotulo, dica, children }) {
  return (
    <label className="block">
      <span className="label">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-sm text-slate-500">{dica}</span>}
    </label>
  );
}

// Botao de remover linha, discreto e vermelho no hover.
function BotaoRemover({ onClick, oQue, titulo = "Remover" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={oQue ? `Remover ${oQue}` : titulo}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-bad-50 hover:text-bad-600"
    >
      <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

const TAGS_MOTIVO = [
  { valor: "", rotulo: "Sem tag" },
  { valor: "semContato", rotulo: "Sem contato" },
  { valor: "esquecimento", rotulo: "Esquecimento" },
  { valor: "disputa", rotulo: "Disputa" },
  { valor: "nfNaoEnviada", rotulo: "NF não enviada" },
];

export default function Configuracoes() {
  const sessao = sessaoDaArea();
  const { config, updateConfig, resetarConfig, marcacoesProntas, erroMarcacoes, recarregarMarcacoes, syncConfig, tentarSalvarConfig } = useApp();
  const geral = podeAbrir("configuracoes", sessao);
  const local = useLocation();

  const GRUPOS = [
    { id: "financeiro", titulo: "Financeiro e fluxo de caixa", sub: "Reserva mínima e saldo inicial.", ve: geral },
    { id: "cobranca", titulo: "Contas atrasadas e cobrança", sub: "Metas, motivos, régua e faixas de atraso.", ve: geral },
    { id: "orcamentos", titulo: "Orçamentos e vendas", sub: "Limites, vendedores e motivos de perda.", ve: geral },
    { id: "permutas", titulo: "Permutas", sub: "Período de cada permuta.", ve: podeAbrir("permutas", sessao) },
    { id: "marketing", titulo: "Marketing", sub: "Atalhos do Drive.", ve: podeAbrir("marketing", sessao) },
    { id: "campanhas", titulo: "Campanhas", sub: "Metas e períodos dos eventos.", ve: podeAbrir("campanhas", sessao) },
    // A lixeira e so para a conta da direcao ou para quem tem acesso total.
    { id: "lixeira", titulo: "Cadastros retirados", sub: "Recupere cadastros com os anexos.", ve: !!(sessao?.master || sessao?.permissoes?.includes("*")) },
  ].filter((g) => g.ve);

  const [abertos, setAbertos] = useState(lerGrupos);
  // A lixeira so carrega quando o grupo abre pela primeira vez.
  const [lixeiraMontada, setLixeiraMontada] = useState(() => !!lerGrupos().lixeira);
  const setAberto = (id, aberto) => {
    if (id === "lixeira" && aberto) setLixeiraMontada(true);
    setAbertos((a) => {
      if (!!a[id] === aberto) return a;
      const n = { ...a, [id]: aberto };
      try { localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(n)); } catch { /* aba anonima */ }
      return n;
    });
  };
  const todosAbertos = GRUPOS.length > 0 && GRUPOS.every((g) => abertos[g.id]);
  const alternarTodos = () => {
    const n = Object.fromEntries(GRUPOS.map((g) => [g.id, !todosAbertos]));
    if (!todosAbertos && n.lixeira) setLixeiraMontada(true);
    setAbertos((a) => {
      const junto = { ...a, ...n };
      try { localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(junto)); } catch { /* aba anonima */ }
      return junto;
    });
  };

  // ?secao=x abre aquele grupo e rola ate ele.
  const secaoFeita = useRef("");
  useEffect(() => {
    const secao = new URLSearchParams(local.search).get("secao");
    if (!secao || secaoFeita.current === local.search) return;
    secaoFeita.current = local.search;
    setAberto(secao, true);
    requestAnimationFrame(() => document.getElementById(`config-${secao}`)?.scrollIntoView({ block: "start" }));
  }, [local.search]);

  /* OS VENDEDORES REAIS DO ERP. No Mubisys o vendedorId do orçamento É o nome:
     um espaço a mais aqui e a linha do funil fica zerada para sempre,
     parecendo "vendedor sem venda". A lista real vira datalist (sugere sem
     prender) e um aviso por linha quando o nome digitado NÃO existe no ERP. */
  const [vendReais, setVendReais] = useState(null);
  useEffect(() => {
    if (!geral) return;
    let vivo = true;
    comCracha(`${API}/painel-dados?modulo=vendedoresErp`)
      .then((r) => r.json())
      .then((d) => vivo && setVendReais(Array.isArray(d.vendedores) ? d.vendedores.map((v) => v.nome) : null))
      .catch(() => {});   // sem a lista, a tela segue como antes, só sem sugestão
    return () => { vivo = false; };
  }, [geral]);

  const p = config.parametros;
  const setParam = (chave, valor) =>
    updateConfig((c) => {
      c.parametros[chave] = valor;
      return c;
    });
  // Nao grava campo vazio como 0: isso zerava colchao/metas e desligava os
  // alertas financeiros. Vazio transitorio e ignorado; negativos tambem.
  const setParamNum = (chave) => (e) => {
    const raw = e.target.value;
    if (raw === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    setParam(chave, n);
  };

  /* O ESTADO DE GRAVACAO SEMPRE VISIVEL, grudado no topo: quem mexe numa regra
     la embaixo precisa ver se salvou sem rolar de volta. */
  const erroSync = syncConfig.status === "erro";
  const estado = erroMarcacoes ? (
    <>
      <AlertCircle size={16} aria-hidden="true" className="shrink-0 text-bad-700" />
      <span className="text-sm text-bad-700">{erroMarcacoes}</span>
      <button type="button" className="btn-outline h-10" onClick={recarregarMarcacoes}>Tentar carregar de novo</button>
    </>
  ) : !marcacoesProntas ? (
    <><Loader2 size={16} aria-hidden="true" className="shrink-0 animate-spin text-slate-500" /><span className="text-sm text-slate-600">Carregando regras…</span></>
  ) : erroSync ? (
    <>
      <AlertCircle size={16} aria-hidden="true" className="shrink-0 text-bad-700" />
      <span className="text-sm text-bad-700">Alterações não salvas. {syncConfig.erro}</span>
      <button type="button" className="btn-outline h-10" onClick={tentarSalvarConfig}>Tentar salvar</button>
      <button type="button" className="btn-ghost h-10" onClick={() => { if (window.confirm("Descartar as alterações não salvas e carregar as regras atuais?")) recarregarMarcacoes(); }}>
        Recarregar regras
      </button>
    </>
  ) : syncConfig.status === "salvando" ? (
    <><Loader2 size={16} aria-hidden="true" className="shrink-0 animate-spin text-slate-500" /><span className="text-sm text-slate-600">Salvando…</span></>
  ) : syncConfig.status === "pendente" ? (
    <><Loader2 size={16} aria-hidden="true" className="shrink-0 text-slate-500" /><span className="text-sm text-slate-600">Aguardando gravação…</span></>
  ) : (
    <><Check size={16} aria-hidden="true" className="shrink-0 text-ok-700" /><span className="text-sm text-slate-700">Regras salvas</span></>
  );
  const botaoTodos = GRUPOS.length > 1 && (
    <button type="button" className="btn-ghost h-10" onClick={alternarTodos}>
      {todosAbertos ? "Recolher tudo" : "Abrir tudo"}
    </button>
  );
  const grupo = (id) => GRUPOS.find((g) => g.id === id);
  // Uma FUNCAO, e nao um componente declarado aqui dentro: componente criado a
  // cada render remonta tudo o que tem dentro, e o campo perdia o foco a cada
  // tecla.
  const bloco = (id, conteudo) => {
    const g = grupo(id);
    if (!g) return null;
    return <Grupo id={id} titulo={g.titulo} sub={g.sub} aberto={!!abertos[id]} aoAlternar={(v) => setAberto(id, v)}>{conteudo}</Grupo>;
  };

  return (
    <div className="area-sistemas">
      <CabecalhoDaArea ativa="configuracoes" sessao={sessao} />

      {geral ? (
        <div role={erroMarcacoes || erroSync ? "alert" : "status"}
          className="area-barra-estado sticky top-2 z-20 flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{estado}</div>
          {botaoTodos}
        </div>
      ) : botaoTodos ? <div className="flex justify-end">{botaoTodos}</div> : null}

      <div className="space-y-3">
        {geral && (
          <fieldset disabled={!marcacoesProntas} className="min-w-0 space-y-3 border-0 p-0">
            {bloco("financeiro", <>
              <Sub titulo="Caixa e saldo inicial" sub="Reserva mínima e origem do saldo usado no fluxo de caixa.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Campo rotulo="Colchão mínimo de caixa (R$)">
                    <input type="number" className="input tnum" value={p.colchaoMinimo} onChange={setParamNum("colchaoMinimo")} />
                  </Campo>
                </div>
                <div className="mt-6 border-t pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="label mb-1">Saldo inicial do fluxo de caixa</p>
                      <p className="text-sm text-slate-500">
                        Use a soma das contas bancárias do Mubisys ou informe um valor manual.
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
                        <input type="number" className="input tnum" value={p.saldoInicialManual} onChange={setParamNum("saldoInicialManual")} />
                      </Campo>
                    </div>
                  )}
                </div>
              </Sub>
            </>)}

            {bloco("cobranca", <>
              <Sub titulo="Metas e período da cobrança" sub="Prazos de recebimento e limite entre cobrança ativa e histórico.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Campo rotulo="DSO meta (dias)">
                    <input type="number" className="input tnum" value={p.dsoMeta} onChange={setParamNum("dsoMeta")} />
                  </Campo>
                  <Campo rotulo="DSO de alerta (dias)">
                    <input type="number" className="input tnum" value={p.dsoAlerta} onChange={setParamNum("dsoAlerta")} />
                  </Campo>
                  <Campo rotulo="Cobrança ativa a partir de" dica="Vencimentos anteriores ficam no histórico e não entram nos totais da cobrança ativa.">
                    <input className="input" type="date" value={p.dataCorteAtrasados || ""} onChange={(e) => { if (e.target.value) setParam("dataCorteAtrasados", e.target.value); }} />
                  </Campo>
                </div>
              </Sub>

              <Sub titulo="Motivos de atraso" sub="A causa de cada título em aberto. O grupo define se a falha é sua ou do cliente.">
                {/* Renomear os tres grupos de causa (o id nao muda, so o nome). */}
                <div className="grid gap-4 sm:grid-cols-3">
                  {config.gruposCausa.map((g, i) => (
                    <Campo key={g.id} rotulo={`Grupo ${i + 1}`}>
                      <input className="input" value={g.nome}
                        onChange={(e) => updateConfig((c) => { c.gruposCausa[i].nome = e.target.value; return c; })} />
                    </Campo>
                  ))}
                </div>

                <div className="mt-6 space-y-3">
                  {config.motivosAtraso.map((m, i) => (
                    <div key={m.id} className="area-motivo-linha rounded-xl border p-2 sm:p-3">
                      <input className="c-nome input" aria-label={`Nome do motivo ${i + 1}`} value={m.nome}
                        placeholder="Nome do motivo"
                        onChange={(e) => updateConfig((c) => { c.motivosAtraso[i].nome = e.target.value; return c; })} />
                      <select className="c-grupo select px-2.5" aria-label={`Grupo do motivo ${i + 1}`} value={m.grupo}
                        onChange={(e) => updateConfig((c) => { c.motivosAtraso[i].grupo = e.target.value; return c; })}>
                        {config.gruposCausa.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                      </select>
                      <select className="c-tag select px-2.5" aria-label={`Classificação do motivo ${i + 1}`} value={m.tag || ""}
                        onChange={(e) => updateConfig((c) => { c.motivosAtraso[i].tag = e.target.value || null; return c; })}>
                        {TAGS_MOTIVO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                      </select>
                      <span className="c-lixo">
                        <BotaoRemover oQue="este motivo de atraso"
                          onClick={() => updateConfig((c) => { c.motivosAtraso.splice(i, 1); return c; })} />
                      </span>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-ghost mt-4"
                  onClick={() => updateConfig((c) => { c.motivosAtraso.push({ id: "m-" + Date.now(), nome: "", grupo: "cliente", tag: null }); return c; })}>
                  <Plus size={16} strokeWidth={2.4} aria-hidden="true" /> Adicionar motivo
                </button>
              </Sub>

              <Sub titulo="Régua de cobrança e próxima ação" sub="A ação sugerida cresce conforme os dias de atraso.">
                <div className="space-y-3">
                  {config.reguaCobranca.map((f, i) => (
                    /* No celular cada faixa vira uma caixa, com a lixeira ao lado dos
                       dias: solta numa linha propria, nao se sabia de qual faixa ela era. */
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-xl border p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:border-0 sm:p-0">
                      <div>
                        <span className="label sm:hidden">Até quantos dias</span>
                        <div className="flex items-center gap-2">
                          <input type="number" className="input tnum" aria-label={`Limite de dias da faixa ${i + 1}`} value={f.ateDias}
                            onChange={(e) => {
                              /* A mesma guarda do setParamNum: vazio transitorio e
                                 negativo nao gravam. Number("") e 0, e um 0 fantasma
                                 aqui mudava a acao de cobranca sugerida em silencio. */
                              const n = Number(e.target.value);
                              if (e.target.value === "" || !Number.isFinite(n) || n < 0) return;
                              updateConfig((c) => { c.reguaCobranca[i].ateDias = n; return c; });
                            }} />
                          <span className="shrink-0 text-sm text-slate-500">dias</span>
                        </div>
                      </div>
                      <input className="input order-last col-span-2 sm:order-none sm:col-span-1" aria-label={`Ação da faixa ${i + 1}`} value={f.acao} placeholder="Ação sugerida"
                        onChange={(e) => updateConfig((c) => { c.reguaCobranca[i].acao = e.target.value; return c; })} />
                      <BotaoRemover oQue="esta faixa da régua de cobrança"
                        onClick={() => updateConfig((c) => { c.reguaCobranca.splice(i, 1); return c; })} />
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-ghost mt-4"
                  onClick={() => updateConfig((c) => { c.reguaCobranca.push({ ateDias: 0, acao: "" }); return c; })}>
                  <Plus size={16} strokeWidth={2.4} aria-hidden="true" /> Adicionar faixa
                </button>

                {/* Regras por motivo */}
                <div className="mt-6 space-y-3 border-t pt-6">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Regras por motivo</h4>
                    <p className="mt-0.5 text-sm text-slate-500">Sobrepõem a régua quando o motivo do título casa.</p>
                  </div>
                  <Aviso tom="info">A regra por motivo sempre vence a régua de dias.</Aviso>
                  <div className="space-y-3">
                    {config.regrasPorMotivo.map((r, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto] sm:border-0 sm:p-0">
                        <select className="select" aria-label={`Motivo da exceção ${i + 1}`} value={r.motivoId}
                          onChange={(e) => updateConfig((c) => { c.regrasPorMotivo[i].motivoId = e.target.value; return c; })}>
                          {config.motivosAtraso.map((m) => <option key={m.id} value={m.id}>{m.nome || "Sem nome"}</option>)}
                        </select>
                        <input className="input order-last col-span-2 sm:order-none sm:col-span-1" aria-label={`Ação da exceção ${i + 1}`} value={r.acao} placeholder="Ação que vence a régua"
                          onChange={(e) => updateConfig((c) => { c.regrasPorMotivo[i].acao = e.target.value; return c; })} />
                        <BotaoRemover oQue="esta regra por motivo"
                          onClick={() => updateConfig((c) => { c.regrasPorMotivo.splice(i, 1); return c; })} />
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn-ghost"
                    onClick={() => updateConfig((c) => {
                      const primeiro = c.motivosAtraso[0];
                      c.regrasPorMotivo.push({ motivoId: primeiro ? primeiro.id : "", acao: "" });
                      return c;
                    })}>
                    <Plus size={16} strokeWidth={2.4} aria-hidden="true" /> Adicionar regra por motivo
                  </button>
                </div>
              </Sub>

              <Sub titulo="Faixas de idade dos atrasos" sub="Os limites em dias que agrupam os títulos por tempo de atraso.">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {config.faixasIdade.map((v, i) => (
                    <Campo key={i} rotulo={`Faixa ${i + 1} (até dias)`}>
                      <input type="number" className="input tnum" value={v}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") return;
                          const n = Number(raw);
                          if (!Number.isFinite(n) || n < 0) return;
                          updateConfig((c) => { c.faixasIdade[i] = n; return c; });
                        }} />
                    </Campo>
                  ))}
                </div>
              </Sub>
            </>)}

            {bloco("orcamentos", <>
              <Sub titulo="Limites e acompanhamento comercial" sub="Valor mínimo, período considerado e prazos para retomar cada proposta.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Campo rotulo="Valor mínimo de orçamento (R$)">
                    <input type="number" className="input tnum" value={p.valorMinimoOrcamento} onChange={setParamNum("valorMinimoOrcamento")} />
                  </Campo>
                  <Campo rotulo="Data de corte dos orçamentos" dica="Considera orçamentos a partir desta data.">
                    <input
                      type="date"
                      className="input tnum"
                      // O cache do Mubisys comeca em 1 de janeiro do ano corrente; nao
                      // deixa escolher antes disso (mostraria "zero" enganoso).
                      min={`${new Date().getFullYear()}-01-01`}
                      value={p.dataCorteOrcamentos}
                      onChange={(e) => setParam("dataCorteOrcamentos", e.target.value)}
                    />
                  </Campo>
                  <Campo rotulo="Orçamento parado após (dias)">
                    <input type="number" className="input tnum" value={p.diasParado} onChange={setParamNum("diasParado")} />
                  </Campo>
                  <Campo rotulo="Vira escalada após (dias)" dica="Sem contato acima disso vira escalada.">
                    <input type="number" className="input tnum" value={p.diasEscala} onChange={setParamNum("diasEscala")} />
                  </Campo>
                </div>
              </Sub>

              <Sub titulo="Vendedores" sub="O time que aparece no funil de orçamentos.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {config.vendedores.map((v, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <input className="input" aria-label={`Nome do vendedor ${i + 1}`} value={v.nome}
                          placeholder="Nome do vendedor" list="vendedores-erp"
                          onChange={(e) => updateConfig((c) => {
                            // O id acompanha o nome: no Mubisys o `vendedorId` do
                            // orcamento E o nome do vendedor, entao um id proprio
                            // nunca casaria e a linha ficaria zerada para sempre.
                            c.vendedores[i].nome = e.target.value;
                            c.vendedores[i].id = e.target.value.trim();
                            return c;
                          })} />
                        <BotaoRemover oQue="este vendedor da lista"
                          onClick={() => updateConfig((c) => { c.vendedores.splice(i, 1); return c; })} />
                      </div>
                      {vendReais && v.nome.trim() && !vendReais.includes(v.nome.trim()) && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-warn-700">
                          <AlertTriangle size={14} aria-hidden="true" /> Não está no ERP: confira o nome, senão a linha do funil fica zerada.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {vendReais && (
                  <datalist id="vendedores-erp">
                    {vendReais.map((n) => <option key={n} value={n} />)}
                  </datalist>
                )}
                <button type="button" className="btn-ghost mt-4"
                  onClick={() => updateConfig((c) => { c.vendedores.push({ id: "", nome: "" }); return c; })}>
                  <Plus size={16} strokeWidth={2.4} aria-hidden="true" /> Adicionar vendedor
                </button>
              </Sub>

              <Sub titulo="Motivos de perda de orçamento" sub="As razões possíveis quando um orçamento não fecha.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {config.motivosPerda.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <input className="input" aria-label={`Nome do motivo ${i + 1}`} value={m.nome} placeholder="Motivo da perda"
                        onChange={(e) => updateConfig((c) => { c.motivosPerda[i].nome = e.target.value; return c; })} />
                      <BotaoRemover oQue="este motivo de perda"
                        onClick={() => updateConfig((c) => { c.motivosPerda.splice(i, 1); return c; })} />
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-ghost mt-4"
                  onClick={() => updateConfig((c) => { c.motivosPerda.push({ id: "mp-" + Date.now(), nome: "" }); return c; })}>
                  <Plus size={16} strokeWidth={2.4} aria-hidden="true" /> Adicionar motivo de perda
                </button>
              </Sub>
            </>)}
          </fieldset>
        )}

        {bloco("permutas", <>
          <Sub titulo="Período de cada permuta" sub="Defina o intervalo de busca de O.S. de cada parceria."><ConfiguracaoPermutas /></Sub>
        </>)}
        {bloco("marketing", <>
          <Sub titulo="Atalhos do Drive" sub="Cadastre os endereços que aparecem na biblioteca de Marketing."><ConfiguracaoMarketing /></Sub>
        </>)}
        {bloco("campanhas", <>
          <Sub titulo="Metas e períodos dos eventos" sub="Defina a meta e o intervalo de busca de O.S. de cada campanha."><ConfiguracaoCampanhas /></Sub>
        </>)}
        {bloco("lixeira", <>
          <Sub titulo="Cadastros retirados" sub="Documentos e equipamentos têm a própria lixeira.">
            {lixeiraMontada && <LixeiraRegistros />}
          </Sub>
        </>)}
      </div>

      {geral && (
        <section className="rounded-2xl border border-bad-200 bg-white p-5" aria-labelledby="zona-cuidado">
          <h2 id="zona-cuidado" className="text-base font-semibold text-slate-900">Restaurar regras gerais</h2>
          <p className="mt-1 text-sm text-slate-600">
            Limites, motivos, régua e vendedores de Financeiro, Cobrança e Orçamentos voltam ao padrão.
            Permutas, Marketing e Campanhas não mudam.
          </p>
          <button
            type="button"
            className="btn-outline mt-4 h-10 text-bad-700"
            disabled={!marcacoesProntas}
            onClick={() => {
              /* CONFIRMA: um toque acidental (o botao ficava no topo, no
                 celular) apagava motivos, regua e vendedores calibrados e JA
                 GRAVAVA na nuvem; recuperar exigia restaurar um backup inteiro.
                 Desde 26/09/2026 ele mora aqui no fim, e continua confirmando. */
              if (!window.confirm(
                "Restaurar as regras gerais de Financeiro, Cobrança e Orçamentos? Limites, motivos, régua e vendedores voltam ao padrão. Os ajustes de Permutas, Marketing e Campanhas permanecem como estão."
              )) return;
              resetarConfig();
            }}
          >
            Restaurar regras gerais
          </button>
        </section>
      )}
    </div>
  );
}
