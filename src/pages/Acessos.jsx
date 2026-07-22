// Acessos: trocar a propria senha e (para a direcao) definir quem entra e o que
// cada um ve. As acoes do servidor ja existiam em netlify/functions/auth.mjs;
// esta e a tela que faltava para usa-las.

import { useCallback, useEffect, useState } from "react";
import { KeyRound, UserPlus, Trash2, ShieldCheck, AlertTriangle, Check } from "lucide-react";
import { chamarAuth, getSessao } from "../lib/sessao.js";
import { Card, PageTitle, SectionTitle, Empty } from "../components/ui.jsx";

// Espelha MODULOS de netlify/functions/auth.mjs. O servidor e quem valida.
const MODULOS = [
  { id: "contas-atrasadas", nome: "Contas Atrasadas", sub: "quem deve e a cobranca" },
  { id: "fluxo-caixa", nome: "Fluxo de Caixa", sub: "caixa, projecao e realizado" },
  { id: "produtos", nome: "Produtos", sub: "faturamento por produto e familia" },
  { id: "orcamentos", nome: "Orcamentos", sub: "funil e conversao do time" },
  { id: "configuracoes", nome: "Configuracoes", sub: "regras do painel e acessos" },
];

const VAZIO = { usuario: "", nome: "", senha: "", permissoes: [] };

function Aviso({ tom, children }) {
  if (!children) return null;
  const cor =
    tom === "ok" ? "bg-ok-50 text-ok-700" : tom === "erro" ? "bg-bad-50 text-bad-700" : "bg-warn-50 text-warn-700";
  return (
    <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${cor}`}>
      {tom === "ok" ? (
        <Check size={15} className="mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      )}
      {children}
    </p>
  );
}

export default function Acessos() {
  const sessao = getSessao();
  const ehDirecao = !!sessao?.master;

  // --- trocar a propria senha
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [msgSenha, setMsgSenha] = useState(null); // {tom, texto}
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function trocarSenha(e) {
    e.preventDefault();
    setMsgSenha(null);
    if (nova.length < 6) return setMsgSenha({ tom: "erro", texto: "A nova senha precisa ter ao menos 6 caracteres." });
    if (nova !== repetir) return setMsgSenha({ tom: "erro", texto: "As duas senhas novas nao sao iguais." });
    setSalvandoSenha(true);
    try {
      await chamarAuth("trocarMinhaSenha", { senhaAtual: atual, novaSenha: nova });
      setMsgSenha({ tom: "ok", texto: "Senha trocada. Use a nova da proxima vez que entrar." });
      setAtual("");
      setNova("");
      setRepetir("");
    } catch (err) {
      setMsgSenha({ tom: "erro", texto: err.message });
    } finally {
      setSalvandoSenha(false);
    }
  }

  // --- contas (so a direcao)
  const [contas, setContas] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [msgConta, setMsgConta] = useState(null);
  const [salvandoConta, setSalvandoConta] = useState(false);

  const carregar = useCallback(async () => {
    if (!ehDirecao) return;
    try {
      const r = await chamarAuth("listarContas");
      setContas(r.contas || []);
    } catch (err) {
      setMsgConta({ tom: "erro", texto: err.message });
      setContas([]);
    }
  }, [ehDirecao]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alternarModulo = (id) =>
    setForm((f) => ({
      ...f,
      permissoes: f.permissoes.includes(id)
        ? f.permissoes.filter((x) => x !== id)
        : [...f.permissoes, id],
    }));

  async function salvarConta(e) {
    e.preventDefault();
    setMsgConta(null);
    setSalvandoConta(true);
    try {
      await chamarAuth("salvarConta", form);
      setMsgConta({ tom: "ok", texto: `Acesso de ${form.nome || form.usuario} salvo.` });
      setForm(VAZIO);
      carregar();
    } catch (err) {
      setMsgConta({ tom: "erro", texto: err.message });
    } finally {
      setSalvandoConta(false);
    }
  }

  async function remover(usuario) {
    setMsgConta(null);
    try {
      await chamarAuth("removerConta", { usuario });
      setMsgConta({ tom: "aviso", texto: `Acesso de ${usuario} removido.` });
      carregar();
    } catch (err) {
      setMsgConta({ tom: "erro", texto: err.message });
    }
  }

  const editar = (c) => setForm({ usuario: c.usuario, nome: c.nome, senha: "", permissoes: c.permissoes || [] });

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Acessos"
        descricao="Sua senha e, para a direcao, quem entra no painel e o que cada um enxerga."
      />

      {/* Minha senha -- todo mundo */}
      <Card>
        <SectionTitle
          titulo="Minha senha"
          sub="Troque quando quiser. Precisa da senha atual para ninguem tomar sua conta."
        />
        <form onSubmit={trocarSenha} className="grid max-w-md gap-4">
          <div>
            <label className="label" htmlFor="s-atual">
              Senha atual
            </label>
            <input
              id="s-atual"
              type="password"
              className="input"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="s-nova">
              Nova senha
            </label>
            <input
              id="s-nova"
              type="password"
              className="input"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              autoComplete="new-password"
              placeholder="ao menos 6 caracteres"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="s-rep">
              Repita a nova senha
            </label>
            <input
              id="s-rep"
              type="password"
              className="input"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {msgSenha && <Aviso tom={msgSenha.tom}>{msgSenha.texto}</Aviso>}
          <button className="btn-primary w-fit" disabled={salvandoSenha}>
            <KeyRound size={16} strokeWidth={2.4} />
            {salvandoSenha ? "Salvando..." : "Trocar minha senha"}
          </button>
        </form>
      </Card>

      {!ehDirecao ? null : (
        <>
          {/* Cadastro de acesso */}
          <Card>
            <SectionTitle
              titulo={form.usuario && contas?.some((c) => c.usuario === form.usuario) ? "Editar acesso" : "Novo acesso"}
              sub="Marque o que a pessoa pode abrir. O que nao estiver marcado nao aparece no menu nem responde se ela digitar o endereco."
            />
            <form onSubmit={salvarConta} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="c-usuario">
                    Usuario (para entrar)
                  </label>
                  <input
                    id="c-usuario"
                    className="input"
                    value={form.usuario}
                    onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))}
                    placeholder="ex: camila"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="c-nome">
                    Nome
                  </label>
                  <input
                    id="c-nome"
                    className="input"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="ex: Camila Souza"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="c-senha">
                    Senha
                  </label>
                  <input
                    id="c-senha"
                    type="password"
                    className="input"
                    value={form.senha}
                    onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                    placeholder="em branco = mantem a atual"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div>
                <p className="label mb-2">O que esta pessoa pode abrir</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {MODULOS.map((m) => {
                    const marcado = form.permissoes.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-all ${
                          marcado ? "border-brand-300 bg-brand-50/60" : "hover:bg-slate-50"
                        }`}
                        style={marcado ? undefined : { borderColor: "var(--hairline)" }}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternarModulo(m.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200"
                        />
                        <span className="min-w-0">
                          <span className="block font-display text-sm font-medium text-slate-900">
                            {m.nome}
                          </span>
                          <span className="block text-xs text-slate-500">{m.sub}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {msgConta && <Aviso tom={msgConta.tom}>{msgConta.texto}</Aviso>}

              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-primary" disabled={salvandoConta}>
                  <UserPlus size={16} strokeWidth={2.4} />
                  {salvandoConta ? "Salvando..." : "Salvar acesso"}
                </button>
                {form.usuario && (
                  <button type="button" className="btn-ghost" onClick={() => setForm(VAZIO)}>
                    Limpar
                  </button>
                )}
              </div>
            </form>
          </Card>

          {/* Quem tem acesso hoje */}
          <Card>
            <SectionTitle titulo="Quem tem acesso" sub="Clique numa linha para editar." />
            {contas === null ? (
              <Empty>Carregando...</Empty>
            ) : contas.length === 0 ? (
              <Empty>
                Ninguem cadastrado ainda. So a direcao entra, com a senha definida no Netlify.
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr>
                      <th className="th text-left">Pessoa</th>
                      <th className="th text-left">Usuario</th>
                      <th className="th text-left">Pode abrir</th>
                      <th className="th text-right">Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contas.map((c) => (
                      <tr
                        key={c.usuario}
                        className="cursor-pointer border-t transition-colors hover:bg-slate-50"
                        style={{ borderColor: "var(--hairline)" }}
                        onClick={() => editar(c)}
                      >
                        <td className="td font-display font-medium text-slate-900">{c.nome}</td>
                        <td className="td text-slate-500">{c.usuario}</td>
                        <td className="td">
                          <span className="flex flex-wrap gap-1">
                            {(c.permissoes || []).length === 0 ? (
                              <span className="text-sm text-slate-400">nada liberado</span>
                            ) : (
                              (c.permissoes || []).map((p) => (
                                <span key={p} className="chip">
                                  {MODULOS.find((m) => m.id === p)?.nome || p}
                                </span>
                              ))
                            )}
                          </span>
                        </td>
                        <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => remover(c.usuario)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-bad-50 hover:text-bad-700"
                            title={`Remover o acesso de ${c.nome}`}
                            aria-label={`Remover o acesso de ${c.nome}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              Remover o acesso impede novos logins, mas quem ja esta logado segue ate a sessao
              vencer (12 horas). Para tirar alguem na hora, troque a senha dele.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
