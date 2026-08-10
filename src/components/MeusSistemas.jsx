// Os outros sistemas da casa, abertos sem digitar senha de novo.
//
// So aparece para quem entrou pela entrada unica -- ela e que planta o cracha
// de cada sistema. Quem entrou pela porta antiga nao ve nada aqui, e esta certo:
// mostrar um atalho que cai na tela de login seria pior do que nao mostrar.
//
// O RH aparece com um aviso: la o cracha e a sessao do Supabase Auth, que este
// painel ainda nao planta. O atalho leva ate a porta; a senha ainda e digitada
// uma vez.

import { ExternalLink } from "lucide-react";
import { meusSistemas, enderecoDe, NOME_SISTEMA } from "../lib/entradaUnica.js";

export default function MeusSistemas() {
  const sistemas = meusSistemas();
  if (!sistemas.length) return null;

  return (
    <div className="mt-8">
      <p className="label mb-2">Seus sistemas</p>
      <div className="flex flex-wrap gap-2">
        {sistemas.map((s) => {
          const precisaSenha = s === "rh";
          return (
            <a
              key={s}
              href={enderecoDe(s)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm
                         font-display font-semibold text-slate-700 hover:bg-slate-50"
              style={{ borderColor: "var(--hairline)" }}
              title={precisaSenha
                ? "O RH ainda pede a senha uma vez"
                : "Abre já entrado"}
            >
              {NOME_SISTEMA[s] || s}
              {precisaSenha && <span className="font-normal text-slate-400">pede senha</span>}
              <ExternalLink size={13} className="shrink-0 text-slate-400" />
            </a>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Abrem já entrados. Ao sair do painel, esses acessos saem junto.
      </p>
    </div>
  );
}
