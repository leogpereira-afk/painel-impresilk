// Porta de entrada do painel. Segue o desenho do app de RH (tela dividida:
// marca a esquerda, formulario a direita) para os dois sistemas da Impresilk
// parecerem a mesma casa.

import { useState } from "react";
import { LogIn, User, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { login, motivoSaida } from "../lib/sessao.js";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";

export default function Login({ aoEntrar }) {
  // Lembra so o USUARIO, nunca a senha: guardar senha no navegador seria
  // entregar o acesso a quem sentar na maquina.
  const K_LEMBRAR = "painel_ultimo_usuario";
  const [usuario, setUsuario] = useState(() => {
    try {
      return localStorage.getItem(K_LEMBRAR) || "";
    } catch {
      return "";
    }
  });
  const [lembrar, setLembrar] = useState(() => {
    try {
      return !!localStorage.getItem(K_LEMBRAR);
    } catch {
      return false;
    }
  });
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  // Lido UMA vez na montagem: motivoSaida() ja apaga a mensagem ao ler, entao
  // ela nao pode ficar dentro do render.
  const [motivo] = useState(motivoSaida);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setErro("");
    setEnviando(true);
    try {
      const s = await login(usuario, senha);
      try {
        if (lembrar) localStorage.setItem(K_LEMBRAR, usuario.trim());
        else localStorage.removeItem(K_LEMBRAR);
      } catch {}
      aoEntrar?.(s);
    } catch (err) {
      setErro(err.message || "Nao consegui entrar.");
      setSenha("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Lado da marca: so no desktop, para o celular ir direto ao formulario. */}
      <div
        className="relative hidden flex-col justify-between p-10 text-white lg:flex"
        style={{ background: "linear-gradient(150deg, #16334f 0%, #0f2236 55%, #0c1c2e 100%)" }}
      >
        {/* max-w impede a logo de esticar na coluna larga: `w-auto` sozinho
            deixa a imagem assumir a largura do flex e ela borra. */}
        <img src={logoWhite} alt="Impresilk" className="h-9 w-auto max-w-[190px] object-contain" />
        <div>
          <h1 className="max-w-md font-display text-4xl font-bold leading-tight tracking-tight">
            A gestao da Impresilk, num lugar so.
          </h1>
          <p className="mt-4 max-w-md leading-relaxed text-white/70">
            Contas a receber, caixa, produtos e orcamentos, com os numeros do ERP atualizados
            sozinhos. Cada pessoa ve o que precisa para o seu trabalho.
          </p>
        </div>
        <p className="text-sm text-white/50">Impresilk Solucoes Visuais · Montes Claros/MG</p>
      </div>

      {/* Lado do formulario */}
      <div className="flex items-center justify-center bg-canvas px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="card p-7 sm:p-8">
            <img src={logoColor} alt="Impresilk" className="mx-auto h-9 w-auto dark:hidden" />
            <img src={logoWhite} alt="Impresilk" className="mx-auto hidden h-9 w-auto dark:block" />

            <h2 className="mt-6 font-display text-xl font-semibold text-slate-900">
              Acessar o painel
            </h2>
            <p className="mt-1 text-sm text-slate-500">Informe seu usuario e sua senha.</p>

            <form onSubmit={enviar} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="usuario">
                  Usuario
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="usuario"
                    className="input pl-9"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    placeholder="Seu usuario"
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="senha">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="senha"
                    type={verSenha ? "text" : "password"}
                    className="input pr-10"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setVerSenha((v) => !v)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Por que a pessoa voltou para o login. Vem de sair(motivo) e
                  so aparece uma vez -- ate 04/08/2026 o cracha vencia no meio
                  do trabalho e a tela virava esta aqui, calada. */}
              {!erro && motivo && (
                <p className="flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {motivo}
                </p>
              )}

              {erro && (
                <p className="flex items-start gap-2 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {erro}
                </p>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200"
                />
                Lembrar meu usuario neste aparelho
              </label>

              <button type="submit" className="btn-primary w-full" disabled={enviando}>
                <LogIn size={16} strokeWidth={2.4} />
                {enviando ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>

          <p className="mt-4 px-1 text-center text-xs text-slate-400">
            Esqueceu a senha? Fale com a direcao para redefinir.
          </p>
        </div>
      </div>
    </div>
  );
}
