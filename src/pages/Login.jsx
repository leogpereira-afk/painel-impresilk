// Porta de entrada do painel. Segue o desenho do app de RH (tela dividida:
// marca a esquerda, formulario a direita) para os dois sistemas da Impresilk
// parecerem a mesma casa.

import { useState } from "react";
import { LogIn, User, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { login } from "../lib/sessao.js";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";

export default function Login({ aoEntrar }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setErro("");
    setEnviando(true);
    try {
      const s = await login(usuario, senha);
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
        <img src={logoWhite} alt="Impresilk" className="h-9 w-auto" />
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

              {erro && (
                <p className="flex items-start gap-2 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {erro}
                </p>
              )}

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
