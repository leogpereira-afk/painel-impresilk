/* A VISÃO GERAL DO MARKETING (o chip "Visão geral", ?v=geral).
 *
 * De cima para baixo, na ordem do contrato da a2:
 *  1. a central Fazer: as ações abertas e os itens únicos pendentes de todos
 *     os canais, separados por prazo (atrasadas, hoje, próximos 7 dias,
 *     depois, sem prazo), com o filtro "Minhas" quando o login tem pessoa;
 *  2. os quatro números: ações abertas, atrasadas, publicações em 7 dias e
 *     investimento do mês (2 colunas no celular, 4 no computador);
 *  3. a lista "Ações e resultados" de sempre (PlanejamentoMarketing).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ListTodo, Megaphone, Plus, Wallet } from 'lucide-react';
import FilaFazer from './FilaFazer.jsx';
import PlanejamentoMarketing from '../PlanejamentoMarketing.jsx';
import { SetaVariacao } from '../ChipCanal.jsx';
import { Card, SectionTitle, StatCard, Empty, Segmented } from '../ui.jsx';
import { useMarketing } from './contexto.js';
import { kpisGerais, linhasFazer } from './derivar.js';
import { useParamNavegavel } from '../../hooks/useParamNavegavel.js';
import { moeda, moedaCompacta, numero, numeroCompacto, rotuloMes } from '../../lib/format.js';

export const QUEM = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'minhas', rotulo: 'Minhas' },
];

/** O filtro "Todas | Minhas" do Fazer. Só aparece quando o servidor achou a
 *  pessoa do login (id_pessoa); sem ela, "minhas" não teria como filtrar. */
export function useFiltroQuem() {
  const { painel } = useMarketing();
  const [quem, setQuem] = useParamNavegavel('quem', 'todas', ['todas', 'minhas'], { replace: true });
  const temPessoa = !!painel.idPessoa;
  return { quem: temPessoa ? quem : 'todas', setQuem, temPessoa, idPessoa: temPessoa && quem === 'minhas' ? painel.idPessoa : null };
}

function textoVariacao(ind) {
  if (!ind || typeof ind.variacao !== 'number') return '';
  if (ind.variacao === 0) return 'igual aos 7 dias anteriores';
  return `${numero(Math.abs(ind.variacao))} a ${ind.variacao > 0 ? 'mais' : 'menos'} que nos 7 dias anteriores`;
}

export default function VisaoGeral() {
  const { painel, hoje, pessoas, canaisPorId, idsDaFileira, podeGravar, ehGestao, abrir, sairLinha, concluirLinha, mantidos } = useMarketing();
  const { quem, setQuem, temPessoa, idPessoa } = useFiltroQuem();
  const linhas = useMemo(
    () => linhasFazer({ acoes: painel.acoes, playbook: painel.playbook, mantidos, idPessoa, canaisDoPlaybook: idsDaFileira }),
    [painel.acoes, painel.playbook, mantidos, idPessoa, idsDaFileira]
  );
  const k = useMemo(() => kpisGerais(painel, hoje), [painel, hoje]);
  const semCanais = painel.canais.length === 0;

  const abrirLinha = (l) => abrir({ tipo: l.tipo === 'acao' ? 'acao' : 'item', id: l.id });

  return (
    <div className="space-y-5">
      {semCanais && (
        <div className="rounded-xl bg-warn-50 p-4 text-sm text-warn-700">
          <p>Nenhum canal cadastrado ainda. Os chips, o playbook e os números de cada canal aparecem depois que a gestão cadastrar os canais.</p>
          {ehGestao && (
            <Link className="btn-outline mt-3 min-h-11" to="/configuracoes?secao=marketing">
              Cadastrar os canais
            </Link>
          )}
        </div>
      )}

      <Card>
        <SectionTitle
          titulo="Fazer"
          sub="Ações abertas e itens do playbook que ainda faltam, de todos os canais."
          acao={
            <div className="flex flex-wrap items-center gap-2">
              {temPessoa && <Segmented opcoes={QUEM} valor={quem} onChange={setQuem} />}
              {podeGravar && (
                <button type="button" className="btn-primary min-h-11" onClick={() => abrir({ tipo: 'acao' })}>
                  <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                  Nova ação
                </button>
              )}
            </div>
          }
        />
        <FilaFazer
          linhas={linhas}
          hoje={hoje}
          canaisPorId={canaisPorId}
          pessoas={pessoas}
          podeGravar={podeGravar}
          onConcluir={concluirLinha}
          onAbrir={abrirLinha}
          onSair={sairLinha}
          vazio={
            <Empty className="gap-3">
              <p>{quem === 'minhas' ? 'Nada pendente com o seu nome.' : 'Nada pendente. Tudo em dia.'}</p>
              {podeGravar && (
                <button type="button" className="btn-outline min-h-11" onClick={() => abrir({ tipo: 'acao' })}>
                  Nova ação
                </button>
              )}
            </Empty>
          }
        />
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard rotulo="Ações abertas" valor={k.abertas == null ? 'sem dado' : numero(k.abertas)} icone={ListTodo} sub="Ainda não publicadas nem encerradas" />
        <StatCard
          rotulo="Atrasadas"
          valor={k.atrasadas == null ? 'sem dado' : numero(k.atrasadas)}
          icone={AlertTriangle}
          tom={k.atrasadas ? 'bad' : 'neutral'}
          sub={k.atrasadas ? 'Com o prazo vencido' : 'Nenhuma com o prazo vencido'}
        />
        <StatCard
          rotulo="Publicações em 7 dias"
          valor={k.publicacoes ? <span title={`${numero(k.publicacoes.valor)} publicações`}>{numeroCompacto(k.publicacoes.valor)}</span> : 'sem dado'}
          icone={Megaphone}
          sub={
            k.publicacoes ? (
              <span className="inline-flex items-center gap-1">
                {k.publicacoes.variacao !== 0 && <SetaVariacao variacao={k.publicacoes.variacao} subirE="bom" />}
                {textoVariacao(k.publicacoes)}
              </span>
            ) : null
          }
        />
        <StatCard
          rotulo="Investimento do mês"
          valor={k.investimentoMes == null ? 'sem dado' : <span title={moeda(k.investimentoMes)}>{moedaCompacta(k.investimentoMes) || moeda(0)}</span>}
          icone={k.investimentoMes == null ? CalendarClock : Wallet}
          sub={`Ações com prazo em ${rotuloMes(k.mes)}`}
        />
      </div>

      <PlanejamentoMarketing />
    </div>
  );
}
