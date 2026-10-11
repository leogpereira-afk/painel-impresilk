/* A FAIXA "FONTES" DA VISÃO GERAL DO MARKETING (integrações, 11/10/2026).
 *
 * Um selo por fonte de dados (Site, Google, Meta, Google Ads, LinkedIn,
 * Pinterest): o nome e o estado ESCRITO, na cor do estado. A cor nunca é a
 * única informação. Cada selo leva a Configurações > Marketing > Conexões,
 * já na linha daquela fonte (?fonte=). O estado é o mesmo da linha de lá
 * (faixaDasFontes usa o situacaoDaFonte), e as duas telas nunca discordam.
 *
 * DISCRETA NA FALHA: se a ação "fontes" falhar (ou a função ainda for a
 * antiga), a faixa vira uma frase pequena com "Tentar de novo", e o resto da
 * Visão geral segue de pé.
 *
 * A LEITURA É A LEVE, PELA MEMÓRIA ÚNICA (useFontesMarketing.js): só o
 * estado das seis fontes, sem os "dados", e guardada para a sub-aba Dados e
 * o bloco Conexões. Voltar à Visão geral em menos de 10 minutos não pede
 * nada: as fontes mudam uma vez por dia (a coleta da manhã) ou no "Atualizar
 * agora", que já põe a fonte nova na memória.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Skeleton } from '../ui.jsx';
import { useFontesMarketing } from './dados/useFontesMarketing.js';
import { faixaDasFontes } from '../../lib/calc/marketing-conexoes.js';
import './conexoes.css';

// A cor do estado, por tom (todas com par no tema escuro). Ela vai no
// TEXTO do estado, e não num ponto ao lado: o ponto custava 66px na faixa,
// e com ele os seis selos não cabiam numa linha a 1280px.
const TEXTO = { ok: 'text-ok-700', warn: 'text-warn-700', bad: 'text-bad-700', neutral: 'text-slate-500' };

export default function FaixaFontes() {
  const { retrato, erro, recarregar } = useFontesMarketing({ leve: true });
  const itens = useMemo(() => faixaDasFontes(retrato), [retrato]);

  return (
    <section className="card mkt-bloco mkt-faixa-fontes" aria-labelledby="titulo-fontes-geral">
      <h2 id="titulo-fontes-geral" className="mkt-faixa-fontes-titulo font-display font-semibold text-slate-900">
        Fontes
      </h2>
      {/* Os selos são irmãos do título na mesma fileira que quebra: no
          celular o título ocupa só o começo da primeira linha, e os selos
          usam a largura toda (numa lista ao lado do título, a 375px, eram
          cinco linhas de um selo só). */}
      {itens && itens.length > 0 ? (
        itens.map((i) => (
          <Link
            key={i.fonte}
            to={`/configuracoes?secao=marketing&fonte=${encodeURIComponent(i.fonte)}`}
            className="mkt-fonte-selo alvo-44"
            title={`${i.info.texto} Abre as conexões em Configurações.`}
            aria-label={`${i.rotulo}: ${i.info.rotulo}. Abrir as conexões`}
          >
            <span className="truncate font-medium text-slate-800">{i.rotulo}</span>
            <span className={clsx('truncate', TEXTO[i.info.tom] || TEXTO.neutral)}>{i.info.rotulo}</span>
          </Link>
        ))
      ) : itens ? (
        <p className="text-xs text-slate-500">Nenhuma fonte de dados cadastrada no servidor.</p>
      ) : erro ? (
        <p role="status" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span className="min-w-0">Não deu para ler agora. {erro}</span>
          <button type="button" className="btn-ghost alvo-40 min-h-7 px-2 py-0.5 text-xs" onClick={recarregar}>
            Tentar de novo
          </button>
        </p>
      ) : (
        <Skeleton className="h-8 min-w-0 flex-1" />
      )}
    </section>
  );
}
