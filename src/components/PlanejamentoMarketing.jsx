import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { moeda, ymdLocal, dataLonga } from '../lib/format.js';
import { podeAbrir } from '../lib/sessao.js';
import { retirarAcaoMarketing, migrarAcoesAntigasMarketing } from '../services/marketing.js';
import { SITUACOES_FEITAS } from '../../supabase/functions/_shared/marketing.mjs';
import CardCompacto from './CardCompacto.jsx';
import { corDoCanal } from './ChipCanal.jsx';
import { Selo } from './lista.jsx';
import { Empty } from './ui.jsx';
import { TopoBloco } from './marketing/Bloco.jsx';
import { useMarketing, useOrcamentosMarketing, mudouNoServidor } from './marketing/contexto.js';
import { linkSeguro, nomeDoResponsavel } from './marketing/derivar.js';

/* AÇÕES E RESULTADOS. Desde 10/10/2026 as ações moram nas tabelas do
   Centro de Comando do Marketing (painel-marketing), com a trava "um
   orçamento numa ação só" no banco.
   Valor vendido (R$ das propostas ganhas) só aparece para quem tem o módulo
   Campanhas, como pede a especificação; quem tem só Marketing vê execução,
   quantidade de propostas e conversão.

   Etapa a2 (11/10/2026): a lista mora na Visão geral e lê as ações da
   página (contexto.js), as mesmas do Fazer: concluir lá tira daqui no mesmo
   instante. Criar e editar abrem na Gaveta (marketing/FormAcao.jsx), que
   ganhou Canal (um dos canais cadastrados) e Responsável (a pessoa do RH pelo
   id_pessoa). O texto antigo de canal e de responsável continua guardado e
   aparece aqui enquanto ninguém escolhe o canal ou a pessoa.
   Cada ação é um CardCompacto, fora de outro cartão (nunca cartão dentro de
   cartão), com no máximo duas ações à vista.

   Cabeçalho numa linha (11/10/2026): o título, a frase, o mês do prazo e o
   "Nova ação" no mesmo TopoBloco do resto da página; o filtro de mês, que
   ocupava uma linha própria com o rótulo em cima do campo, entrou nele. */

const SITUACAO_TOM = { Ideia: 'neutral', 'Produção': 'brand', 'Aprovação': 'warn', Programada: 'brand', Publicada: 'ok', Encerrada: 'neutral' };

export default function PlanejamentoMarketing() {
  const { painel, hoje, pessoas, canaisPorId, podeGravar, abrir, tirar, recarregar, avisar } = useMarketing();
  const orcs = useOrcamentosMarketing();
  const [mes, setMes] = useState(() => ymdLocal(new Date()).slice(0, 7));
  const [ocupado, setOcupado] = useState(false);
  const veValorVendido = podeAbrir('campanhas');

  const acoes = useMemo(() => [...painel.acoes].sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999')), [painel.acoes]);
  const doMes = acoes.filter((a) => !mes || a.prazo?.startsWith(mes));

  async function retirar(a) {
    if (!window.confirm(`Retirar a ação "${a.nome}"? Ela sai da lista e os orçamentos ligados a ela ficam livres para outra ação. O registro fica guardado no histórico.`)) return;
    setOcupado(true);
    try {
      await retirarAcaoMarketing(a.id, a.versao);
      tirar.acao(a.id);
      avisar(`Ação "${a.nome}" retirada.`);
    } catch (e) {
      if (mudouNoServidor(e)) {
        await recarregar();
        avisar(`${e.message} A lista foi atualizada.`, 'erro');
      } else avisar(e.message, 'erro');
    } finally {
      setOcupado(false);
    }
  }

  async function migrar() {
    setOcupado(true);
    try {
      const r = await migrarAcoesAntigasMarketing();
      await recarregar();
      avisar(`${r.migradas} ação(ões) antiga(s) trazida(s), com ${r.vinculos} orçamento(s).`);
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setOcupado(false);
    }
  }

  const canalDaAcao = (a) => {
    const c = a.canalId ? canaisPorId.get(a.canalId) : null;
    if (c) return { nome: c.nome, cor: corDoCanal(c) };
    return { nome: a.canal || 'Sem canal', cor: null };
  };
  const responsavelDaAcao = (a) => {
    // Lista de pessoas ainda chegando: mostra o texto antigo (se houver) em
    // vez de "Sem responsável", que seria mentira.
    if (a.responsavelId && !Array.isArray(pessoas)) return a.responsavel || 'Responsável';
    return nomeDoResponsavel({ responsavelId: a.responsavelId, responsavelTexto: a.responsavel }, pessoas) || 'Sem responsável';
  };

  return (
    <section aria-labelledby="titulo-acoes-marketing">
      <TopoBloco
        id="titulo-acoes-marketing"
        titulo="Ações e resultados"
        sub="Objetivo, responsável, prazo e oportunidades de cada ação."
        acao={
          <>
            <label className="flex items-center gap-2">
              <span className="label-filtro">Mês do prazo</span>
              <input className="filtro h-10" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </label>
            {mes ? (
              <button type="button" className="btn-ghost alvo-40 min-h-9 px-3 py-1.5" onClick={() => setMes('')}>
                Ver todos os meses
              </button>
            ) : (
              <button type="button" className="btn-ghost alvo-40 min-h-9 px-3 py-1.5" onClick={() => setMes(ymdLocal(new Date()).slice(0, 7))}>
                Mês atual
              </button>
            )}
            {podeGravar && (
              <button type="button" className="btn-primary alvo-40 min-h-9 px-3 py-1.5" onClick={() => abrir({ tipo: 'acao' })}>
                <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                Nova ação
              </button>
            )}
          </>
        }
      />
      {painel.legado.pendentes > 0 && (
        <div className="mb-3 rounded-lg bg-warn-50 p-3 text-sm text-warn-700">
          {painel.legado.pendentes} ação(ões) ainda no formato antigo.
          {painel.podeMigrar ? (
            <>
              {' '}
              <button type="button" className="btn-outline ml-2 min-h-11" disabled={ocupado} onClick={migrar}>
                Trazer para o formato novo
              </button>
            </>
          ) : (
            ' A direção precisa trazer para o formato novo.'
          )}
        </div>
      )}
      {doMes.length === 0 ? (
        <Empty className="gap-3 px-4">
          <p>Nenhuma ação neste recorte. Cadastre uma ação com responsável e prazo para começar.</p>
          {podeGravar && (
            <button type="button" className="btn-outline min-h-11" onClick={() => abrir({ tipo: 'acao' })}>
              Nova ação
            </button>
          )}
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {doMes.map((a) => {
            const vinculados = orcs.filter((o) => (a.orcamentos || []).includes(String(o.id)));
            const ganhos = vinculados.filter((o) => o.situacao === 'ganho');
            const completa = vinculados.length === (a.orcamentos || []).length;
            const canal = canalDaAcao(a);
            const vencida = a.prazo && a.prazo < hoje && !SITUACOES_FEITAS.includes(a.status);
            const material = linkSeguro(a.url);
            return (
              <CardCompacto
                key={a.id}
                titulo={a.nome}
                sub={a.objetivo || 'Defina o objetivo desta ação.'}
                acoes={[
                  { rotulo: podeGravar ? 'Editar ação' : 'Ver ação', onClick: () => abrir({ tipo: 'acao', id: a.id }), desabilitado: ocupado },
                  material && { rotulo: 'Abrir material', href: material, icone: ArrowUpRight },
                ]}
                menu={podeGravar ? [{ rotulo: 'Retirar', perigo: true, desabilitado: ocupado, onClick: () => retirar(a) }] : []}
              >
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                    <Selo tom={SITUACAO_TOM[a.status] || 'neutral'}>{a.status}</Selo>
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${canal.cor ? '' : 'border border-slate-200'}`}
                        style={canal.cor ? { backgroundColor: canal.cor } : undefined}
                        aria-hidden="true"
                      />
                      <span className="truncate">{canal.nome}</span>
                    </span>
                    <span className="truncate">{responsavelDaAcao(a)}</span>
                    <span>{a.prazo ? dataLonga(a.prazo) : 'Sem prazo'}</span>
                  </div>
                  {vencida && <p className="text-bad-700">Prazo vencido · atualizar o próximo passo</p>}
                  <div className="rounded-lg bg-slate-50 p-3">
                    Investimento: <b>{moeda(a.investimento)}</b>
                    <br />
                    {completa
                      ? `${vinculados.length} propostas atribuídas · ${ganhos.length} ganhas` +
                        (veValorVendido ? ` · ${moeda(ganhos.reduce((s, o) => s + o.valor, 0))} em propostas ganhas` : '')
                      : 'Parte dos orçamentos não está na base disponível; resultado incompleto.'}
                    {completa && vinculados.length > 0 && (
                      <p>
                        Custo por proposta: {moeda(a.investimento / vinculados.length)} · Conversão: {Math.round((ganhos.length / vinculados.length) * 100)}%
                      </p>
                    )}
                  </div>
                </div>
              </CardCompacto>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Os resultados seguem os orçamentos vinculados e o estado atual da base. Proposta ganha não significa pagamento recebido; investimento é informado pela equipe.
      </p>
    </section>
  );
}
