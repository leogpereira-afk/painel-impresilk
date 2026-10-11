/* OS RESULTADOS DO CANAL (?sub=resultados).
 *
 *  - os números da semana (lançamento semanal) contra a semana anterior,
 *    número a número, com a seta do marketing (subir é bom);
 *  - as 5 melhores publicações por engajamento e por leads;
 *  - as últimas publicações, para lançar o número que ficou faltando;
 *  - os botões "Lançar números da semana", "Lançar publicação" e
 *    "Importar CSV".
 *
 * TODO NÚMERO DIZ DE ONDE VEIO E DE QUANDO ("Lançado à mão em 12/10"). E
 * número que ninguém lançou aparece como "não informado", nunca como 0: zero
 * é medida, vazio é ausência dela (as contas de marketing-canais.js já
 * devolvem nulo; aqui só não se inventa).
 */
import { useMemo, useState } from 'react';
import { FileUp, Plus, BarChart3 } from 'lucide-react';
import { Empty } from '../ui.jsx';
import { Bloco, TopoBloco } from './Bloco.jsx';
import { SetaVariacao } from '../ChipCanal.jsx';
import { useMarketing } from './contexto.js';
import { semanaParaComparar, semanaParaLancar, semanasDoCanal, ultimasPublicacoes } from './derivar.js';
import { compararSemanas, fonteDoNumero, somarDias, topPublicacoes } from '../../lib/calc/marketing-canais.js';
import { dataCurta, dataLonga, numero, numeroCompacto } from '../../lib/format.js';

const ROTULO_TOP = { engajamento: 'Engajamento', leads: 'Leads' };

const percentual = (fracao) => `${fracao > 0 ? '+' : ''}${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;

/** Um número com o valor exato no title (o compacto arredonda). */
function Numero({ valor, className = '' }) {
  if (valor == null) return <span className={`text-slate-400 ${className}`}>não informado</span>;
  return (
    <span className={`tnum ${className}`} title={numero(valor)}>
      {numeroCompacto(valor)}
    </span>
  );
}

function CelulaSemana({ n }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
      <p className="label mb-1">{n.rotulo}</p>
      <p className="font-display text-xl font-semibold text-slate-900">
        {n.atual == null ? <span className="text-sm font-normal text-slate-400">não informado</span> : <Numero valor={n.atual} />}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {n.anterior == null ? (
          'sem número na semana anterior'
        ) : (
          <>
            antes: <Numero valor={n.anterior} />
            {n.diferenca != null && n.diferenca !== 0 && (
              <span className="inline-flex items-center gap-0.5">
                <SetaVariacao variacao={n.diferenca} subirE="bom" size={13} />
                {n.variacao != null ? percentual(n.variacao) : `${n.diferenca > 0 ? '+' : ''}${numero(n.diferenca)}`}
              </span>
            )}
            {n.diferenca === 0 && <span>igual</span>}
          </>
        )}
      </p>
    </div>
  );
}

function LinhaPublicacao({ p, hoje, direita, onAbrir }) {
  return (
    <button type="button" className="mkt-linha" onClick={onAbrir}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-800">{p.titulo || p.url || 'Publicação sem título'}</span>
        <span className="block truncate text-xs text-slate-500">
          {dataLonga(p.data)} · {fonteDoNumero(p, hoje)}
        </span>
      </span>
      {direita}
    </button>
  );
}

function resumoNumeros(p) {
  const partes = [
    ['alcance', 'alcance'],
    ['engajamento', 'engajamento'],
    ['leads', 'leads'],
  ]
    .filter(([k]) => p[k] != null)
    .map(([k, r]) => `${numeroCompacto(p[k])} ${r}`);
  return partes.length ? partes.join(' · ') : 'sem números ainda';
}

export default function Resultados({ canal }) {
  const { painel, hoje, podeGravar, abrir } = useMarketing();
  const [escolhida, setEscolhida] = useState(null);
  const metricas = useMemo(() => painel.metricas.filter((m) => m.canalId === canal.id), [painel.metricas, canal.id]);
  const pubs = useMemo(() => painel.publicacoes.filter((p) => p.canalId === canal.id), [painel.publicacoes, canal.id]);
  const semanas = useMemo(() => semanasDoCanal(painel.metricas, canal.id, hoje), [painel.metricas, canal.id, hoje]);
  const escolheu = !!escolhida && semanas.includes(escolhida);
  const semana = escolheu ? escolhida : semanaParaComparar(painel.metricas, canal.id, hoje);
  const cmp = useMemo(() => compararSemanas(metricas, semana), [metricas, semana]);
  const tops = useMemo(() => ({ engajamento: topPublicacoes(pubs, 'engajamento'), leads: topPublicacoes(pubs, 'leads') }), [pubs]);
  const ultimas = useMemo(() => ultimasPublicacoes(painel.publicacoes, canal.id, 5), [painel.publicacoes, canal.id]);
  const nadaLancado = metricas.length === 0;

  // A semana da comparação é a última COM número; para lançar, só a que a
  // pessoa escolheu de propósito, ou a que ainda falta.
  const lancarSemana = () =>
    abrir({ tipo: 'metricas', canalId: canal.id, semana: escolheu ? escolhida : semanaParaLancar(painel.metricas, canal.id, hoje) });
  const lancarPublicacao = () => abrir({ tipo: 'publicacao', canalId: canal.id });

  return (
    <div className="space-y-3">
      {/* Botões desenhados com 36px, toque de 40px: são controles. */}
      {podeGravar && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary alvo-40 min-h-9 px-3 py-1.5" onClick={lancarSemana}>
            <BarChart3 size={16} strokeWidth={2.2} aria-hidden="true" />
            Lançar números da semana
          </button>
          <button type="button" className="btn-outline alvo-40 min-h-9 px-3 py-1.5" onClick={lancarPublicacao}>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            Lançar publicação
          </button>
          <button type="button" className="btn-outline alvo-40 min-h-9 px-3 py-1.5" onClick={() => abrir({ tipo: 'csv', canalId: canal.id })}>
            <FileUp size={16} strokeWidth={2.2} aria-hidden="true" />
            Importar CSV
          </button>
        </div>
      )}

      <Bloco>
        <TopoBloco
          titulo="Números da semana"
          subSempre
          sub={cmp?.atual ? fonteDoNumero(cmp.atual, hoje) : 'Nada lançado nesta semana.'}
          acao={
            semanas.length > 1 && (
              <label className="flex items-center gap-2">
                <span className="label-filtro">Semana</span>
                <select className="filtro h-10" value={semana} onChange={(e) => setEscolhida(e.target.value)}>
                  {semanas.map((s) => (
                    <option key={s} value={s}>
                      {dataCurta(s)} a {dataCurta(somarDias(s, 6))}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
        />
        {nadaLancado ? (
          <Empty className="gap-3 px-4">
            <p>Nenhum número lançado para {canal.nome} nas últimas semanas.</p>
            {podeGravar && (
              <button type="button" className="btn-outline min-h-11" onClick={lancarSemana}>
                Lançar números da semana
              </button>
            )}
          </Empty>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Semana de {dataCurta(cmp.semana)} a {dataCurta(somarDias(cmp.semana, 6))}, comparada com a de {dataCurta(cmp.semanaAnterior)}.
              {cmp.anterior ? ` Anterior: ${fonteDoNumero(cmp.anterior, hoje).toLocaleLowerCase('pt-BR')}.` : ''}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cmp.numeros.map((n) => (
                <CelulaSemana key={n.campo} n={n} />
              ))}
            </div>
          </>
        )}
      </Bloco>

      <div className="grid gap-3 lg:grid-cols-2">
        {['engajamento', 'leads'].map((campo) => (
          <Bloco key={campo}>
            {/* subSempre: o critério diz por que uma publicação não está na
                lista, e isso é dado; fica à vista também no celular. */}
            <TopoBloco subSempre titulo={`Top 5 por ${ROTULO_TOP[campo].toLocaleLowerCase('pt-BR')}`} sub="Só entra publicação com o número lançado." />
            {tops[campo]?.length ? (
              <div>
                {tops[campo].map((p) => (
                  <LinhaPublicacao
                    key={p.id}
                    p={p}
                    hoje={hoje}
                    onAbrir={() => abrir({ tipo: 'publicacao', id: p.id })}
                    direita={<Numero valor={p[campo]} className="shrink-0 font-display text-sm font-semibold text-slate-900" />}
                  />
                ))}
              </div>
            ) : (
              <Empty className="gap-3 px-4">
                <p>Nenhuma publicação com {ROTULO_TOP[campo].toLocaleLowerCase('pt-BR')} lançado.</p>
                {podeGravar && (
                  <button type="button" className="btn-outline min-h-11" onClick={lancarPublicacao}>
                    Lançar publicação
                  </button>
                )}
              </Empty>
            )}
          </Bloco>
        ))}
      </div>

      {ultimas.length > 0 && (
        <Bloco>
          {/* subSempre: é instrução de uso, e o celular (onde o title não
              abre) é justamente o aparelho de toque. */}
          <TopoBloco subSempre titulo="Últimas publicações" sub="Toque para lançar ou corrigir os números." />
          <div>
            {ultimas.map((p) => (
              <LinhaPublicacao
                key={p.id}
                p={p}
                hoje={hoje}
                onAbrir={() => abrir({ tipo: 'publicacao', id: p.id })}
                direita={<span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{resumoNumeros(p)}</span>}
              />
            ))}
          </div>
        </Bloco>
      )}
    </div>
  );
}
