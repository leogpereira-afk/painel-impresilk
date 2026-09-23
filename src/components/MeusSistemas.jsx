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
  } from "lucide-react";
import { meusSistemas, enderecoDe } from "../lib/entradaUnica.js";
import { nomeSis, doSistema, CHAVE_CRACHA } from "../lib/sistemas.js";
import { iconeDoSistema } from "./iconesDosSistemas.js";

// O ícone vem do REGISTRO (lib/sistemas.js), resolvido em
// iconesDosSistemas.js. A tabela local que morava aqui divergia da lateral:
// Brief era prancheta aqui e régua lá, lado a lado no mesmo desktop.

/**
 * `coluna` = empilhado, para a lateral esquerda da Home (pedido do Leo em
 * 23/09/2026: "os botoes de sistemas fica a esquerda"). Sem ele, continua o
 * que sempre foi: cartoes lado a lado, centralizados.
 *
 * O cartao muda de FORMA, nao de conteudo: em coluna o icone fica ao lado do
 * nome (uma linha por sistema) em vez de em cima. Sete cartoes quadrados
 * empilhados fariam uma torre de 1,5 tela.
 */
export default function MeusSistemas({ coluna = false }) {
  const sistemas = meusSistemas();
  if (!sistemas.length) return null;

  return (
    <div className={coluna ? "" : "mt-10"}>
      <p className="label mb-3">Seus sistemas</p>
      <div className={coluna ? "flex flex-col gap-2" : "flex flex-wrap justify-center gap-3"}>
        {sistemas.map((s) => {
          const Icone = iconeDoSistema(doSistema(s));
          /* DERIVADO DO FATO, não escrito à mão: pede senha quem tem endereço
             e NÃO tem chave de crachá plantada pela entrada única. O `=== "rh"`
             antigo mentiria no dia em que o RH ganhasse crachá — ou em que
             outro sistema caísse na situação do RH. */
          const pedeSenha = !CHAVE_CRACHA[s];
          return (
            <a
              key={s}
              href={enderecoDe(s)}
              target="_blank"
              rel="noopener noreferrer"
              title={pedeSenha ? "O RH ainda pede a senha uma vez" : "Abre já entrado"}
              className={
                (coluna
                  ? "flex w-full items-center gap-3 px-3 py-2.5"
                  : "flex w-28 flex-col items-center gap-2 px-3 py-4 hover:-translate-y-0.5") +
                " group rounded-2xl border bg-white transition hover:border-brand-300 hover:shadow-md" +
                " focus:outline-none focus:ring-2 focus:ring-brand-200"
              }
              style={{ borderColor: "var(--hairline)" }}
            >
              <span
                className={
                  (coluna ? "h-9 w-9 shrink-0 rounded-lg" : "h-12 w-12 rounded-xl") +
                  " flex items-center justify-center bg-brand text-white transition group-hover:bg-brand-600"
                }
              >
                <Icone size={coluna ? 18 : 24} strokeWidth={2.1} />
              </span>
              <span className={coluna ? "min-w-0 flex-1" : ""}>
                <span className="block font-display text-sm font-semibold text-slate-800">
                  {nomeSis(s)}
                </span>
                {pedeSenha && (
                  <span className="block text-[11px] leading-tight text-slate-400">pede senha</span>
                )}
              </span>
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
