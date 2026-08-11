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
import { Users, KeyRound, DoorOpen, Pencil, AlertTriangle, Search, UserPlus, Power } from "lucide-react";
import {
  lerAcessos, salvarConta, salvarPapel, removerPapel,
  criarPessoa, definirSenha, desativar,
} from "../services/acesso.js";
import { Card, SectionTitle, Empty } from "./ui.jsx";
import { MODULOS, COM_DINHEIRO } from "../lib/modulos.js";

const NOME_SISTEMA = {
  painel: "Painel", rh: "RH", pcp: "PCP", brief: "Brief",
  dre: "DRE", compras: "Compras", pops: "POPs",
};

// Papeis que cada sistema aceita. COPIA FIEL da lista fechada do equipe-auth
// (supabase/functions/equipe-auth/index.ts, const PAPEIS) -- o servidor valida
// com includes(), sem normalizar: papel que nao esta la e recusado, e papel
// gravado so na tabela nova (que nao tem CHECK) nao e recusado por ninguem e
// simplesmente nao funciona em lugar nenhum.
//
// Esta lista JA ESTEVE ERRADA aqui: "compras" tinha compras/obra (os papeis do
// app antigo) e "pops" nao tinha gestor. Ao mexer, confira na origem.
const PAPEIS = {
  brief: ["vendedor", "designer", "medidor", "admin"],
  pcp: ["admin", "pcp", "montagem", "operacao", "comercial"],
  compras: ["admin", "comprador", "solicitante"],
  dre: ["equipe"],
  pops: ["admin", "gestor", "equipe"],
  rh: ["ADMIN_RH", "GESTOR", "COLABORADOR"],
  // O painel nao usa papel: quem manda la e a lista de modulos (permissoes).
  painel: [],
};

// A senha temporaria aparece UMA vez. Ela nao fica guardada em lugar nenhum
// legivel -- se a direcao fechar esta caixa sem anotar, o caminho e gerar outra.
function SenhaNova({ senha, nome, aoFechar }) {
  if (!senha) return null;
  return (
    <div className="mb-4 rounded-xl border-2 border-brand bg-brand-50 p-4">
      <p className="font-display text-sm font-semibold text-slate-900">
        Senha de {nome}: <span className="font-mono text-base">{senha}</span>
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Anote e passe para a pessoa agora — esta senha não aparece de novo. Ela é obrigada a
        trocar na primeira entrada.
      </p>
      <button type="button" className="btn-ghost mt-2 h-8 px-2 text-xs" onClick={aoFechar}>
        Já anotei
      </button>
    </div>
  );
}

const VAZIA = { usuario: "", nome: "", tipo: "pessoa", colaborador: "" };

function NovaPessoa({ sistemas, aoCriar, aoCancelar }) {
  const [f, setF] = useState(VAZIA);
  const [papeis, setPapeis] = useState({});
  // O Painel nao tem papel: tem lista de partes. Sem escolher aqui, a pessoa
  // nascia com acesso a NADA dentro do painel -- entrava e nao via tela nenhuma.
  const [modulos, setModulos] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const alternar = (sis) =>
    setPapeis((p) => {
      const n = { ...p };
      if (n[sis] === undefined) n[sis] = (PAPEIS[sis] || [])[0] || "";
      else delete n[sis];
      return n;
    });

  const enviar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await aoCriar(f, Object.entries(papeis).map(([sistema, papel]) => ({
        sistema, papel, ...(sistema === "painel" ? { permissoes: modulos } : {}),
      })));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mb-4 space-y-3 rounded-xl border p-4"
      style={{ borderColor: "var(--hairline)" }}>
      <p className="font-display text-sm font-semibold text-slate-900">Nova pessoa</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="np-u">Usuário (como ela digita para entrar)</label>
          <input id="np-u" className="input" value={f.usuario} required
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
          <select id="np-t" className="input" value={f.tipo}
            onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}>
            <option value="pessoa">Uma pessoa</option>
            <option value="funcao">Porta compartilhada (uma função)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="np-c">Quem é no RH</label>
          <input id="np-c" className="input" list="rh-colaboradores" value={f.colaborador}
            placeholder="obrigatório para dar acesso ao RH"
            onChange={(e) => setF((x) => ({ ...x, colaborador: e.target.value }))} />
        </div>
      </div>

      <div>
        <p className="label mb-2">Em quais sistemas ela entra</p>
        <div className="space-y-2">
          {sistemas.map((sis) => (
            <div key={sis} className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-[7rem] cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={papeis[sis] !== undefined}
                  onChange={() => alternar(sis)}
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
                {NOME_SISTEMA[sis] || sis}
              </label>
              {papeis[sis] !== undefined && (PAPEIS[sis] || []).length > 0 && (
                <select className="input h-8 w-auto py-0 text-xs" value={papeis[sis]}
                  onChange={(e) => setPapeis((p) => ({ ...p, [sis]: e.target.value }))}>
                  {PAPEIS[sis].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {papeis[sis] !== undefined && sis === "painel" && (
                <div className="w-full">
                  <ModulosDoPainel permissoes={modulos} aoMudar={setModulos} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        A senha é criada por mim e mostrada uma vez aqui na tela. A pessoa troca na primeira entrada.
      </p>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={salvando}>
          {salvando ? "Criando..." : "Criar e dar acesso"}
        </button>
        <button type="button" className="btn-ghost" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

// O que a pessoa enxerga DENTRO do painel. Ficava numa segunda tela, que
// repetia usuario, nome e senha -- duas listas de conta na mesma pagina, cada
// uma mandando num pedaco. Agora e aqui, no cartao da propria pessoa.
function ModulosDoPainel({ permissoes, aoMudar }) {
  const total = permissoes.includes("*");
  const marcar = (id) =>
    aoMudar(permissoes.includes(id) ? permissoes.filter((x) => x !== id) : [...permissoes, id]);

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-3">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" checked={total}
          onChange={() => aoMudar(total ? [] : ["*"])}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
        <span>
          <b className="font-display">Acesso total</b>
          <span className="block text-xs text-slate-500">
            tudo o que existe no painel, inclusive o que vier depois
          </span>
        </span>
      </label>

      {!total && (
        <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {MODULOS.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={permissoes.includes(m.id)}
                onChange={() => marcar(m.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
              <span className="min-w-0">
                {m.nome}
                {COM_DINHEIRO.has(m.id) && (
                  <span className="ml-1 text-[11px] text-warn-700">R$</span>
                )}
                <span className="block text-xs leading-tight text-slate-500">{m.sub}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        O que não estiver marcado não aparece no menu nem responde se a pessoa digitar o endereço.
        <span className="ml-1 text-warn-700">R$</span> = mostra dinheiro.
      </p>
    </div>
  );
}

function Conta({ c, sistemas, colaboradores, aoMudar, aoAvisar, aoSenha }) {
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

  const trocarModulos = async (permissoes) => {
    try {
      const r = await salvarPapel({ usuario: c.usuario, sistema: "painel", papel: "", permissoes });
      // Modulo que o servidor nao conhece era descartado calado: a caixa ficava
      // marcada e a pessoa nao ganhava nada.
      if (r?.aviso) aoAvisar({ tom: "erro", texto: r.aviso });
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const trocarPapel = async (sis, papel) => {
    try {
      await salvarPapel({ usuario: c.usuario, sistema: sis, papel });
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const novaSenha = async () => {
    if (!confirm(`Gerar uma senha nova para ${c.nome || c.usuario}? A senha atual dela para de valer em todos os sistemas.`)) return;
    try {
      const r = await definirSenha(c.usuario);
      aoSenha({ senha: r.senha, nome: c.nome || c.usuario });
      if (r.recusados?.length) {
        aoAvisar({ tom: "erro", texto: `Não consegui em: ${r.recusados.map((x) => x.sistema).join(", ")}` });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const alternarAtivo = async () => {
    const ligar = c.ativo === false;
    if (!ligar && !confirm(`Desativar ${c.nome || c.usuario}? Ela para de entrar. Quem já está com a sessão aberta continua até o crachá vencer.`)) return;
    try {
      const r = await desativar(c.usuario, ligar);
      if (r.recusados?.length) {
        aoAvisar({ tom: "erro", texto: r.recusados.map((x) => `${NOME_SISTEMA[x.sistema] || x.sistema}: ${x.erro}`).join(" · ") });
      }
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
        {c.ativo === false && <span className="chip-bad shrink-0">desativada</span>}
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
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={editar}>
                <Pencil size={13} /> Editar nome, tipo e vínculo com o RH
              </button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={novaSenha}>
                <KeyRound size={13} /> Gerar nova senha
              </button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={alternarAtivo}>
                <Power size={13} /> {c.ativo === false ? "Reativar" : "Desativar"}
              </button>
            </div>
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
                        {(p.permissoes || []).includes("*")
                          ? "acesso total"
                          : `${(p.permissoes || []).length} de ${MODULOS.length} partes`}
                      </span>
                    )}
                    {p && sis === "painel" && (
                      <div className="w-full">
                        <ModulosDoPainel
                          permissoes={p.permissoes || []}
                          aoMudar={(perms) => trocarModulos(perms)}
                        />
                      </div>
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
  const [criando, setCriando] = useState(false);
  const [senhaNova, setSenhaNova] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerAcessos());
      setErro(null);
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = useCallback(async (conta, papeis) => {
    try {
      const r = await criarPessoa(conta, papeis);
      setSenhaNova({ senha: r.senha, nome: conta.nome || conta.usuario });
      setCriando(false);
      // Sistema que recusou nao pode virar silencio: a pessoa foi criada, mas
      // nao entra naquele -- e so aqui da para dizer por que.
      if (r.recusados?.length) {
        aoAvisar({
          tom: "erro",
          texto: r.recusados.map((x) => `${NOME_SISTEMA[x.sistema] || x.sistema}: ${x.erro}`).join(" · "),
        });
      }
      await carregar();
    } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
  }, [carregar, aoAvisar]);

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

      {/* O aviso ANTIGO dizia que esta tela nao mandava no login -- e nao mandava
          mesmo. Agora manda, e deixar o texto velho seria pior do que nao ter
          aviso: a direcao tiraria um acesso achando que era ensaio. */}
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>
          <b className="font-display">Vale na hora.</b> Cadastrar, mudar papel, desativar e tirar
          acesso mexem no sistema de verdade — não é ensaio. Uma ressalva: quem já está com a
          sessão aberta continua até o crachá vencer (30 dias no campo, 12 horas no painel).
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

      <SenhaNova senha={senhaNova?.senha} nome={senhaNova?.nome}
        aoFechar={() => setSenhaNova(null)} />

      {criando ? (
        <NovaPessoa sistemas={dados.sistemas} aoCriar={criar} aoCancelar={() => setCriando(false)} />
      ) : (
        <button type="button" className="btn-primary mb-3" onClick={() => setCriando(true)}>
          <UserPlus size={15} /> Cadastrar pessoa
        </button>
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
              colaboradores={dados.colaboradores} aoMudar={carregar} aoAvisar={aoAvisar}
              aoSenha={setSenhaNova} />
          ))}
        </div>
      ) : (
        <Empty>Ninguém com esse nome.</Empty>
      )}
    </Card>
  );
}
