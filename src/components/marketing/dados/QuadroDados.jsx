/* UM QUADRO DA SUB-ABA DADOS: o cabeçalho que recolhe, a fonte e a data, o
 * estado quando não está ok, os números e o gráfico, e as seções.
 *
 * COMPACTO (pedido do Léo: "o mais compacto possível levando em conta a
 * qualidade da informação"):
 *  - fechado, o quadro é uma linha com o título e o número que resume
 *    ("100 usuários na semana"), e a legenda da coleta embaixo: a fonte e a
 *    data ficam à vista mesmo recolhido;
 *  - aberto, vêm os números e o gráfico; as tabelas ficam nas SEÇÕES, uma
 *    fileira de chips que abrem cada uma ("Canais · 6 canais"). A seção
 *    principal de cada quadro já nasce aberta; as outras, fechadas;
 *  - aberto ou fechado é lembrado no aparelho, por quadro e por seção
 *    (useAberto.js). O corpo do quadro fechado continua montado (a classe
 *    .recolhido só esconde; no papel ele volta).
 *
 * PARTE QUE NÃO ESTÁ OK MOSTRA O ESTADO, e não números vazios: a frase do que
 * fazer (o texto do estado e o motivo que o servidor mandou) e o atalho para
 * Configurações > Marketing, onde a gestão conecta, reconecta e vê como ligar.
 * Se o cache ainda tem o dado de antes, ele aparece embaixo, com a data dele
 * na legenda.
 */
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronDown, Settings, X } from 'lucide-react';
import { Selo } from '../../lista.jsx';
import { Bloco } from './Blocos.jsx';
import { useAberto, useSecoesAbertas } from './useAberto.js';

const FUNDO_ESTADO = {
  bad: 'border-bad-200 bg-bad-50 text-bad-700',
  warn: 'border-warn-200 bg-warn-50 text-warn-800',
  ok: 'border-ok-200 bg-ok-50 text-ok-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
};

/** O estado do quadro, com a frase do que fazer e o atalho. */
function EstadoDoQuadro({ estado, temDado }) {
  const { info, motivo, chave } = estado;
  const parcial = chave === 'parcial';
  return (
    <div className={clsx('mkt-dados-estado', FUNDO_ESTADO[info.tom] || FUNDO_ESTADO.neutral)} role="status">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p>
          <strong>{info.rotulo}.</strong> {info.texto}
        </p>
        {/* O motivo é a frase do servidor. O código curto (partes.codigo)
            não vai para a tela, nem no title. */}
        {motivo && <p className="break-words">{motivo}</p>}
        {temDado && !parcial && <p>Os números abaixo são da última coleta que trouxe esta parte.</p>}
      </div>
      {/* Atalho de navegação: alvo de 44px (a régua da casa para navegar),
          desenhado com 32px; a caixa do estado tem 8px de respiro, e a
          faixa de 6px de cada lado cabe nela. */}
      {!parcial && (
        <Link to="/configuracoes?secao=marketing" className="btn-outline alvo-44 min-h-8 shrink-0 px-2.5 py-1 text-[13px]">
          <Settings size={14} aria-hidden="true" />
          Configurações, Marketing
        </Link>
      )}
    </div>
  );
}

function Secoes({ quadro }) {
  const { aberta, alternar } = useSecoesAbertas(quadro.id);
  const dom = (s) => `mkt-dados-${quadro.id}-${s.id}`.replace(/[^\w-]/g, '-');
  const abertas = quadro.secoes.filter((s) => aberta(s.id, s.aberta));
  return (
    <div className="space-y-2">
      <div className="mkt-dados-chips" role="group" aria-label={`Detalhes de ${quadro.titulo}`}>
        {quadro.secoes.map((s) => {
          const ligada = aberta(s.id, s.aberta);
          return (
            <button
              key={s.id}
              type="button"
              className={clsx('mkt-dados-chip alvo-40', ligada && 'ligada')}
              aria-expanded={ligada}
              aria-controls={ligada ? dom(s) : undefined}
              onClick={() => alternar(s.id, s.aberta)}
            >
              <span className="truncate">{s.titulo}</span>
              {/* No celular o chip leva só o nome (a contagem dobraria a
                  fileira); a seção aberta mostra a contagem no topo dela. */}
              {s.resumo && <span className="mkt-dados-chip-resumo hidden sm:inline">{s.resumo}</span>}
            </button>
          );
        })}
      </div>
      {/* Só a seção aberta é montada: um quadro do Google Ads tem vinte
          tabelas, e montar as vinte a cada leitura pesaria no celular. */}
      {abertas.map((s) => (
        <section key={s.id} id={dom(s)} className="mkt-dados-secao" aria-labelledby={`${dom(s)}-t`}>
          <div className="mkt-dados-secao-topo">
            <h4 id={`${dom(s)}-t`} className="min-w-0 truncate font-display text-[13px] font-semibold text-slate-800">
              {s.titulo}
              {s.resumo && <span className="ml-2 font-sans text-xs font-normal text-slate-500">{s.resumo}</span>}
            </h4>
            <button type="button" className="btn-ghost alvo-40 h-7 w-7 shrink-0 rounded-lg p-0" onClick={() => alternar(s.id, s.aberta)} aria-label={`Fechar ${s.titulo}`}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-2">
            {s.blocos.map((b, i) => (
              <Bloco key={i} bloco={b} rotulo={`${quadro.titulo}: ${s.titulo}`} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function QuadroDados({ quadro }) {
  const [aberto, alternar] = useAberto(quadro.id, true);
  const corpo = `mkt-dados-${quadro.id}`.replace(/[^\w-]/g, '-');
  const e = quadro.estado;
  const mostraSelo = !e.comDado || e.chave === 'parcial';
  return (
    <section className="card mkt-quadro" aria-labelledby={`${corpo}-titulo`}>
      <div className="mkt-quadro-topo">
        <button type="button" className="mkt-quadro-botao" aria-expanded={aberto} aria-controls={corpo} onClick={alternar}>
          <ChevronDown size={16} aria-hidden="true" className={clsx('mkt-quadro-seta shrink-0 text-slate-500 transition-transform', !aberto && '-rotate-90')} />
          <span className="mkt-quadro-nome">
            <span id={`${corpo}-titulo`} className="mkt-quadro-titulo font-display font-semibold text-slate-900">
              {quadro.titulo}
            </span>
            {quadro.destaque && <span className="mkt-quadro-destaque text-slate-600">{quadro.destaque}</span>}
          </span>
        </button>
        {mostraSelo && (
          <span className="shrink-0">
            <Selo tom={e.info.tom}>{e.info.rotulo}</Selo>
          </span>
        )}
      </div>
      <p className="mkt-quadro-legenda text-slate-500">{quadro.legenda}</p>
      <div id={corpo} className={aberto ? 'mkt-quadro-corpo' : 'recolhido'}>
        {mostraSelo && <EstadoDoQuadro estado={e} temDado={quadro.temDado} />}
        {quadro.vazio && <p className="text-[13px] text-slate-500">{quadro.vazio}</p>}
        {quadro.topo.map((b, i) => (
          <Bloco key={i} bloco={b} rotulo={quadro.titulo} />
        ))}
        {quadro.secoes.length > 0 && <Secoes quadro={quadro} />}
        {quadro.notas.length > 0 && (
          <div className="space-y-0.5">
            {quadro.notas.map((n, i) => (
              <p key={i} className="mkt-dados-nota">
                {n}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Os quadros de uma ligação, um embaixo do outro. */
export function ListaDeQuadros({ quadros }) {
  return quadros.map((q) => <QuadroDados key={q.id} quadro={q} />);
}
