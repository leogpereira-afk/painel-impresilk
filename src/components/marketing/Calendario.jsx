/* O CALENDÁRIO DO CANAL (?sub=calendario&mes=AAAA-MM).
 *
 * O mês em lista compacta, dia a dia, só com os dias que têm alguma coisa:
 * as ações do canal pelo prazo (abertas e feitas) e as publicações pela data.
 * Lista e não grade de 7 colunas: no celular a grade vira quadradinhos de
 * 40px sem lugar para o título, e o que importa aqui é ler o que vem.
 *
 * O mês vai na URL com `replace`: andar de mês em mês não enche o histórico
 * do navegador (o Voltar do celular volta para a tela anterior, não para o
 * mês anterior).
 */
import { useMemo } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { Empty } from '../ui.jsx';
import { Bloco } from './Bloco.jsx';
import { useMarketing } from './contexto.js';
import { MES_VALIDO, calendarioDoMes, diaDaSemana, mesVizinho, nomeDoMes } from './derivar.js';
import { useParamNavegavel } from '../../hooks/useParamNavegavel.js';
import { somarDias } from '../../lib/calc/marketing-canais.js';
import { dataCurta } from '../../lib/format.js';

// As publicações chegam do servidor só dos últimos 400 dias.
const DIAS_PUBLICACOES = 400;

export default function Calendario({ canal }) {
  const { painel, hoje, podeGravar, abrir } = useMarketing();
  const atual = hoje.slice(0, 7);
  const [mes, setMes] = useParamNavegavel('mes', atual, MES_VALIDO, { replace: true });
  const dias = useMemo(() => calendarioDoMes(painel, canal.id, mes), [painel, canal.id, mes]);
  const antigo = mes < somarDias(hoje, -DIAS_PUBLICACOES).slice(0, 7);
  const nome = nomeDoMes(mes);
  const titulo = nome.charAt(0).toUpperCase() + nome.slice(1);

  return (
    <Bloco>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost h-11 w-11 p-0" onClick={() => setMes(mesVizinho(mes, -1))} aria-label="Mês anterior">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 className="min-w-[10rem] text-center font-display text-lg font-semibold text-slate-900" aria-live="polite">
          {titulo}
        </h2>
        <button type="button" className="btn-ghost h-11 w-11 p-0" onClick={() => setMes(mesVizinho(mes, 1))} aria-label="Próximo mês">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        {mes !== atual && (
          <button type="button" className="btn-outline min-h-11" onClick={() => setMes(atual)}>
            Mês atual
          </button>
        )}
      </div>

      {antigo && <p className="mb-3 text-sm text-slate-500">As publicações aparecem só dos últimos 400 dias; as ações aparecem todas.</p>}

      {dias.length === 0 ? (
        <Empty className="mkt-vazio gap-3 px-4">
          <p>Nada neste mês para {canal.nome}.</p>
          {podeGravar && (
            <button type="button" className="btn-outline min-h-11" onClick={() => abrir({ tipo: 'acao', canalId: canal.id })}>
              Nova ação
            </button>
          )}
        </Empty>
      ) : (
        <div>
          {dias.map(({ dia, entradas }) => (
            <section key={dia} className="mkt-dia" aria-label={`${dataCurta(dia)}, ${diaDaSemana(dia)}`}>
              <p className="pt-2 text-sm">
                <span className="font-display font-semibold text-slate-900">{dataCurta(dia)}</span>{' '}
                <span className="text-slate-500">{diaDaSemana(dia)}</span>
                {dia === hoje && <span className="ml-1 font-medium text-brand-700">· hoje</span>}
              </p>
              <div>
                {entradas.map((e) => {
                  const Icone = e.tipo === 'acao' ? CalendarCheck : Megaphone;
                  return (
                    <button key={e.chave} type="button" className="mkt-linha" onClick={() => abrir({ tipo: e.tipo, id: e.id })}>
                      <Icone size={16} strokeWidth={2.2} className="shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${e.feito && e.tipo === 'acao' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{e.titulo}</span>
                        <span className="block truncate text-xs text-slate-500">{e.tipo === 'acao' ? `Ação · ${e.sub}` : e.sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Bloco>
  );
}
