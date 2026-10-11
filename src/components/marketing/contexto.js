/* O QUE AS VISTAS DO MARKETING DIVIDEM: os dados do "painel", as pessoas do
 * RH, o dia de hoje, o papel de quem olha e as funções que gravam.
 *
 * Quem monta é a página (src/pages/Marketing.jsx). As vistas (Visão geral,
 * canal aberto, gavetas) leem daqui em vez de receber dez props cada uma, e
 * todas gravam pelas MESMAS funções: assim a ação concluída no Fazer some da
 * lista de baixo e do chip no mesmo instante, sem um segundo estado que
 * discorde do primeiro.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../config/store.jsx';
import { calcOrcamentos } from '../../lib/calc/orcamentos.js';
import { ymdLocal } from '../../lib/format.js';

export const MarketingCtx = createContext(null);

export function useMarketing() {
  const ctx = useContext(MarketingCtx);
  if (!ctx) throw new Error('useMarketing fora da página do Marketing.');
  return ctx;
}

/* Celular: abaixo do sm do Tailwind (640px) o chip fica compacto (só ícone,
   nome e ponto). Pela largura da janela, que é o que decide se a fileira
   cabe. */
const CELULAR = '(max-width: 639px)';
export function useCelular() {
  const [celular, setCelular] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(CELULAR).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(CELULAR);
    if (!mq) return undefined;
    const mudou = () => setCelular(mq.matches);
    mudou();
    mq.addEventListener?.('change', mudou);
    return () => mq.removeEventListener?.('change', mudou);
  }, []);
  return celular;
}

/* Os orçamentos da base (cache do ERP), para casar o número digitado na ação
   com o id do orçamento e para o cartão de resultado. A mesma conta que a
   lista de ações sempre usou. */
export function useOrcamentosMarketing() {
  const { dados, overridesOrcamentos, config } = useApp();
  return useMemo(
    () => (dados?.orcamentos ? calcOrcamentos(dados.orcamentos, overridesOrcamentos, config, { hoje: ymdLocal(new Date()) }).lista : []),
    [dados, overridesOrcamentos, config]
  );
}

/** Erro que pede para recarregar (outro aparelho mexeu, ou o registro sumiu):
 *  a tela recarrega a lista em vez de deixar a pessoa batendo no mesmo
 *  conflito para sempre. */
export const mudouNoServidor = (e) => /mudou enquanto|não existe mais/.test(e?.message || '');
