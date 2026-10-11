/* O HISTÓRICO DO CANAL (?sub=historico): ações concluídas, itens do
 * playbook feitos e publicações, da mais recente para a mais antiga, 50 por
 * vez ("Mostrar mais"). Tocar abre o detalhe na gaveta.
 */
import { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Megaphone } from 'lucide-react';
import { Empty } from '../ui.jsx';
import { Bloco, TopoBloco } from './Bloco.jsx';
import { useMarketing } from './contexto.js';
import { historicoDoCanal } from './derivar.js';
import { dataLonga } from '../../lib/format.js';

const POR_VEZ = 50;
const ICONE = { acao: CalendarCheck, item: CheckCircle2, publicacao: Megaphone };

export default function Historico({ canal }) {
  const { painel, podeGravar, abrir } = useMarketing();
  const [quantos, setQuantos] = useState(POR_VEZ);
  const itens = useMemo(() => historicoDoCanal(painel, canal.id), [painel, canal.id]);
  const visiveis = itens.slice(0, quantos);
  const faltam = itens.length - visiveis.length;

  return (
    <Bloco>
      {/* subSempre: a janela de 400 dias é o recorte do dado (publicação
          mais velha não aparece), e fica à vista também no celular. */}
      <TopoBloco subSempre titulo="Histórico" sub="Ações concluídas, passos do playbook feitos e publicações (estas, dos últimos 400 dias)." />
      {itens.length === 0 ? (
        <Empty className="gap-3 px-4">
          <p>Nada concluído ainda em {canal.nome}.</p>
          {podeGravar && (
            <button type="button" className="btn-outline min-h-11" onClick={() => abrir({ tipo: 'publicacao', canalId: canal.id })}>
              Lançar publicação
            </button>
          )}
        </Empty>
      ) : (
        <>
          <div>
            {visiveis.map((h) => {
              const Icone = ICONE[h.tipo] || CalendarCheck;
              return (
                <button key={h.chave} type="button" className="mkt-linha" onClick={() => abrir({ tipo: h.tipo, id: h.id })}>
                  <Icone size={16} strokeWidth={2.2} className="shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800">{h.titulo}</span>
                    <span className="block truncate text-xs text-slate-500">{h.tipo === 'acao' ? `Ação · ${h.sub}` : h.sub}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{h.dia ? dataLonga(h.dia) : 'sem data'}</span>
                </button>
              );
            })}
          </div>
          {faltam > 0 && (
            <button type="button" className="btn-ghost mt-2 min-h-11" onClick={() => setQuantos((n) => n + POR_VEZ)}>
              Mostrar mais ({faltam} {faltam === 1 ? 'restante' : 'restantes'})
            </button>
          )}
        </>
      )}
    </Bloco>
  );
}
