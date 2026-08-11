// Os outros sistemas da casa, abertos sem digitar senha de novo.
//
// So aparece para quem entrou pela entrada unica -- ela e que planta o cracha
// de cada sistema. Quem entrou pela porta antiga nao ve nada aqui, e esta certo:
// mostrar um atalho que cai na tela de login seria pior do que nao mostrar.
//
// O RH aparece com um aviso: la o cracha e a sessao do Supabase Auth, que este
// painel ainda nao planta. O atalho leva ate a porta; a senha ainda e digitada
// uma vez.

import {
  ClipboardList, BookOpen, Factory, ShoppingCart, TrendingUp, Users, UserCircle,
  ExternalLink,
} from "lucide-react";
import { meusSistemas, enderecoDe, NOME_SISTEMA } from "../lib/entradaUnica.js";

// Um icone por sistema, escolhido pelo que a pessoa FAZ la dentro -- e o que
// permite achar o certo de relance, sem ler.
const ICONE = {
  brief: ClipboardList,   // a ficha da visita
  pops: BookOpen,         // o procedimento, o manual
  pcp: Factory,           // a producao e a instalacao
  compras: ShoppingCart,
  dre: TrendingUp,
  rh: Users,
  central: UserCircle,     // o app pessoal
};

export default function MeusSistemas() {
  const sistemas = meusSistemas();
  if (!sistemas.length) return null;

  return (
    <div className="mt-10">
      <p className="label mb-3">Seus sistemas</p>
      <div className="flex flex-wrap justify-center gap-3">
        {sistemas.map((s) => {
          const Icone = ICONE[s] || ExternalLink;
          const pedeSenha = s === "rh";
          return (
            <a
              key={s}
              href={enderecoDe(s)}
              target="_blank"
              rel="noopener noreferrer"
              title={pedeSenha ? "O RH ainda pede a senha uma vez" : "Abre já entrado"}
              className="group flex w-28 flex-col items-center gap-2 rounded-2xl border bg-white px-3 py-4
                         transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md
                         focus:outline-none focus:ring-2 focus:ring-brand-200"
              style={{ borderColor: "var(--hairline)" }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white
                           transition group-hover:bg-brand-600"
              >
                <Icone size={24} strokeWidth={2.1} />
              </span>
              <span className="font-display text-sm font-semibold text-slate-800">
                {NOME_SISTEMA[s] || s}
              </span>
              {pedeSenha && (
                <span className="-mt-1 text-[11px] leading-tight text-slate-400">pede senha</span>
              )}
            </a>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Abrem já entrados. Ao sair do painel, esses acessos saem junto.
      </p>
    </div>
  );
}
