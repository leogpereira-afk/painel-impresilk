// Quem entra nos SETE sistemas, num lugar so.
//
// Antes desta tela, saber "o que a Barbara acessa" era abrir tres sistemas e
// somar de cabeca -- as contas viviam em duas tabelas, uma delas com uma linha
// por pessoa POR SISTEMA. Aqui e uma linha por PESSOA, e o que muda por sistema
// e o papel.
//
// A TELA DIZ, EM CIMA, QUE AINDA NAO MANDA NO LOGIN. Sem esse aviso a direcao
// desmarca um sistema, acha que tirou o acesso, e a pessoa continua entrando
// pela tabela antiga. Aviso que a tela nao da, o usuario descobre do pior jeito.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, KeyRound, DoorOpen, Check, Pencil, AlertTriangle, Search } from "lucide-react";
import { lerAcessos, salvarConta, salvarPapel, removerPapel } from "../services/acesso.js";
import { Card, SectionTitle, Empty } from "./ui.jsx";

const NOME_SISTEMA = {
  painel: "Painel", rh: "RH", pcp: "PCP", brief: "Brief",
  dre: "DRE", compras: "Compras", pops: "POPs",
};

// Papeis que cada sistema ja usa hoje. Sao os valores que estao gravados em
// equipe_contas -- inventar nome novo aqui faria a virada gravar papel que
// nenhum sistema reconhece.
const PAPEIS = {
  pcp: ["admin", "pcp", "comercial", "montagem"],
  brief: ["admin", "vendedor", "designer", "medidor"],
  compras: ["admin", "compras", "obra"],
  pops: ["admin", "equipe"],
  dre: ["equipe"],
  rh: ["ADMIN_RH", "GESTOR", "COLABORADOR"],
  painel: [],
};

function Conta({ c, sistemas, colaboradores, aoMudar, aoAvisar }) {
  const [aberta, setAberta] = useState(false);
  const [f, setF] = useState(null);

  const editar = () => {
    setF({ usuario: c.usuario, nome: c.nome || "", tipo: c.tipo, colaborador: c.colaborador || "" });
    setAberta(true);
  };

  const gravar = async (e) => {
    e.preventDefault();
    try {
      await salvarConta(f);
      setF(null);
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const alternarSistema = async (sis) => {
    const tem = c.papeis.some((p) => p.sistema === sis);
    try {
      if (tem) await removerPapel(c.usuario, sis);
      else await salvarPapel({ usuario: c.usuario, sistema: sis, papel: (PAPEIS[sis] || [])[0] || "" });
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const trocarPapel = async (sis, papel) => {
    try {
      await salvarPapel({ usuario: c.usuario, sistema: sis, papel });
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const ehFuncao = c.tipo === "funcao";
  const naoMigradas = c.senhas.filter((s) => !s.migrada).length;

  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <button type="button" onClick={() => setAberta((a) => !a)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
        {ehFuncao
          ? <DoorOpen size={17} className="shrink-0 text-warn-700" title="Porta compartilhada" />
          : <Users size={17} className="shrink-0 text-brand" title="Pessoa" />}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold text-slate-900">
            {c.nome || c.usuario}
            <span className="ml-2 font-normal text-slate-400">{c.usuario}</span>
          </span>
          <span className="block truncate text-xs text-slate-500">
            {c.papeis.length
              ? c.papeis.map((p) => NOME_SISTEMA[p.sistema] || p.sistema).sort().join(" · ")
              : "sem sistema nenhum"}
            {c.colaborador ? ` — ${c.colaborador}` : ""}
          </span>
        </span>
        {ehFuncao && <span className="chip-warn shrink-0">porta de função</span>}
        {c.senhas.length > 1 && (
          <span className="chip shrink-0" title={`${c.senhas.length} senhas diferentes hoje`}>
            {c.senhas.length} senhas
          </span>
        )}
      </button>

      {aberta && (
        <div className="space-y-4 border-t px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
          {f ? (
            <form onSubmit={gravar} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`n-${c.usuario}`}>Nome</label>
                  <input id={`n-${c.usuario}`} className="input" value={f.nome}
                    onChange={(e) => setF((x) => ({ ...x, nome: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor={`t-${c.usuario}`}>O que é esta conta</label>
                  <select id={`t-${c.usuario}`} className="input" value={f.tipo}
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
          ) : (
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={editar}>
              <Pencil size={13} /> Editar nome, tipo e vínculo com o RH
            </button>
          )}

          <div>
            <p className="label mb-2">Sistemas</p>
            <div className="space-y-2">
              {sistemas.map((sis) => {
                const p = c.papeis.find((x) => x.sistema === sis);
                const opcoes = PAPEIS[sis] || [];
                return (
                  <div key={sis} className="flex flex-wrap items-center gap-2">
                    <label className="flex min-w-[7rem] cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!p} onChange={() => alternarSistema(sis)}
                        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
                      {NOME_SISTEMA[sis] || sis}
                    </label>
                    {p && opcoes.length > 0 && (
                      <select className="input h-8 w-auto py-0 text-xs" value={p.papel || ""}
                        onChange={(e) => trocarPapel(sis, e.target.value)}>
                        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {p && sis === "painel" && (
                      <span className="text-xs text-slate-500">
                        {(p.permissoes || []).length
                          ? `${p.permissoes.length} módulo(s) — ajuste na lista de contas acima`
                          : "sem módulo"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {c.senhas.length > 0 && (
            <p className="text-xs text-slate-500">
              {naoMigradas === c.senhas.length
                ? `Guardadas ${c.senhas.length === 1 ? "a senha atual" : `as ${c.senhas.length} senhas atuais`} desta pessoa. Na virada ela entra com qualquer uma delas e essa vira a única.`
                : `${c.senhas.length - naoMigradas} de ${c.senhas.length} já migraram.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AcessoUnico({ aoAvisar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    try {
      setDados(await lerAcessos());
      setErro(null);
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.contas.filter((c) =>
      !q || `${c.usuario} ${c.nome} ${c.colaborador}`.toLowerCase().includes(q));
  }, [dados, busca]);

  const resumo = useMemo(() => {
    if (!dados) return null;
    const pessoas = dados.contas.filter((c) => c.tipo === "pessoa").length;
    const portas = dados.contas.filter((c) => c.tipo === "funcao").length;
    const varias = dados.contas.filter((c) => c.senhas.length > 1).length;
    return { pessoas, portas, varias };
  }, [dados]);

  if (erro) {
    return (
      <Card>
        <p className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erro}
        </p>
      </Card>
    );
  }
  if (!dados) return null;

  return (
    <Card>
      <SectionTitle
        titulo="Quem entra nos sete sistemas"
        sub="Uma linha por pessoa. O que muda de um sistema para outro é o papel, não a conta."
      />

      {/* Sem este aviso a direcao desmarca um sistema, acha que tirou o acesso,
          e a pessoa continua entrando pela tabela antiga. */}
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>
          <b className="font-display">Isto ainda não manda no login.</b> Os sete sistemas continuam
          usando as contas antigas até a virada de cada um. O que você ajusta aqui é como as contas
          vão ficar quando ela acontecer. Para tirar o acesso de alguém <b>hoje</b>, é na lista de
          contas do painel (acima) ou na Central de Acessos.
        </span>
      </p>

      {resumo && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
            <p className="label">Pessoas</p>
            <p className="font-display text-xl font-bold text-slate-900">{resumo.pessoas}</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
            <p className="label">Portas de função</p>
            <p className="font-display text-xl font-bold text-warn-700">{resumo.portas}</p>
            <p className="text-xs text-slate-500">o histórico não diz quem foi</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
            <p className="label">Com mais de uma senha</p>
            <p className="font-display text-xl font-bold text-slate-900">{resumo.varias}</p>
            <p className="text-xs text-slate-500">viram uma só na virada</p>
          </div>
        </div>
      )}

      <div className="sem-impressao relative mb-3 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pessoa, usuário ou nome no RH" />
      </div>

      <datalist id="rh-colaboradores">
        {dados.colaboradores.map((n) => <option key={n} value={n} />)}
      </datalist>

      {lista.length ? (
        <div className="space-y-2">
          {lista.map((c) => (
            <Conta key={c.usuario} c={c} sistemas={dados.sistemas}
              colaboradores={dados.colaboradores} aoMudar={carregar} aoAvisar={aoAvisar} />
          ))}
        </div>
      ) : (
        <Empty>Ninguém com esse nome.</Empty>
      )}
    </Card>
  );
}
