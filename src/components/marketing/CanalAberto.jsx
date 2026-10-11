/* O CANAL ABERTO (?v=<código do canal>).
 *
 * De cima para baixo:
 *  - o cabeçalho do canal, com os atalhos: abrir perfil, abrir gerenciador,
 *    nova publicação e copiar o link do WhatsApp com a mensagem do canal
 *    (CardCompacto: duas à vista, o resto no "...");
 *  - se o canal está EM IMPLANTAÇÃO, o checklist de implantação vem antes de
 *    tudo, com concluir na linha. Os feitos ficam marcados na lista (dá para
 *    desmarcar), para o caminho inteiro ficar à vista;
 *  - as sub-abas Fazer, Resultados, Calendário e Histórico (?sub=).
 *
 * As rotinas do playbook aparecem listadas no Fazer, com o aviso de que
 * entram na agenda na próxima etapa (a3): até lá nada gera tarefa sozinho.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ClipboardCopy, Plus, Settings } from 'lucide-react';
import CardCompacto from '../CardCompacto.jsx';
import LinhaTarefa from '../LinhaTarefa.jsx';
import { IconeCanal, PontoSemaforo, corDoCanal } from '../ChipCanal.jsx';
import { Avatar } from '../lista.jsx';
import { Card, SectionTitle, Segmented, Empty } from '../ui.jsx';
import FilaFazer from './FilaFazer.jsx';
import Resultados from './Resultados.jsx';
import Calendario from './Calendario.jsx';
import Historico from './Historico.jsx';
import { useMarketing } from './contexto.js';
import { useFiltroQuem, QUEM } from './VisaoGeral.jsx';
import { textoRecorrencia } from './Detalhes.jsx';
import {
  SUBS_CANAL,
  itensDeImplantacao,
  linhasFazer,
  linkSeguro,
  linkWhatsapp,
  nomeDoResponsavel,
  resumoDosCanais,
  rotinasDoCanal,
} from './derivar.js';
import { useParamNavegavel } from '../../hooks/useParamNavegavel.js';
import { numero } from '../../lib/format.js';

const SUBS = SUBS_CANAL.map((s) => s.valor);

function CabecalhoCanal({ canal }) {
  const { painel, hoje, podeGravar, ehGestao, abrir, avisar } = useMarketing();
  const navegar = useNavigate();
  const r = useMemo(() => resumoDosCanais({ ...painel, canais: [canal] }, hoje).get(canal.id), [painel, canal, hoje]);
  const perfil = linkSeguro(canal.urlPerfil);
  const gerenciador = linkSeguro(canal.urlGerenciador);
  const whats = linkWhatsapp(canal.mensagemWhatsapp);

  async function copiarWhatsapp() {
    try {
      await navigator.clipboard.writeText(whats);
      avisar('Link do WhatsApp copiado, já com a mensagem do canal. Cole na conversa, no status ou na bio.');
    } catch {
      // Navegador que não deixa copiar (aba sem foco, permissão negada): o
      // link vai no aviso, para copiar à mão.
      avisar(`Não deu para copiar sozinho. Copie este link: ${whats}`, 'erro');
    }
  }

  const acoes = [
    podeGravar && { rotulo: 'Nova publicação', primaria: true, icone: Plus, onClick: () => abrir({ tipo: 'publicacao', canalId: canal.id }) },
    perfil && { rotulo: 'Abrir perfil', href: perfil, icone: ArrowUpRight },
    gerenciador && { rotulo: 'Abrir gerenciador', href: gerenciador, icone: ArrowUpRight },
    whats && { rotulo: 'Copiar link do WhatsApp', icone: ClipboardCopy, onClick: copiarWhatsapp },
  ].filter(Boolean);
  const menu = ehGestao ? [{ rotulo: 'Editar canal e playbook', icone: Settings, onClick: () => navegar('/configuracoes?secao=marketing') }] : [];
  const cor = corDoCanal(canal);
  const ind = r?.indicador;

  return (
    <CardCompacto
      titulo={
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border" style={{ borderColor: cor || 'var(--hairline)', color: cor || undefined }}>
            <IconeCanal nome={canal.icone} size={18} />
          </span>
          <span className="truncate text-base">{canal.nome}</span>
        </span>
      }
      acoes={acoes}
      menu={menu}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <PontoSemaforo semaforo={r?.semaforo} />
        {ind && (
          <span>
            {numero(ind.valor)} {ind.valor === 1 ? 'publicação' : 'publicações'} nos últimos 7 dias
          </span>
        )}
        {r?.pendentes > 0 && (
          <span>
            {r.pendentes} {r.pendentes === 1 ? 'pendente' : 'pendentes'}
          </span>
        )}
        {!perfil && !gerenciador && ehGestao && <span className="text-slate-500">Sem links de perfil e gerenciador cadastrados.</span>}
      </div>
    </CardCompacto>
  );
}

function Implantacao({ canal }) {
  const { painel, hoje, pessoas, podeGravar, ehGestao, abrir, concluirLinha, sairLinha } = useMarketing();
  const navegar = useNavigate();
  const itens = useMemo(() => itensDeImplantacao(painel.playbook, canal.id), [painel.playbook, canal.id]);
  const feitos = itens.filter((i) => i.concluidoEm).length;
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        titulo="Implantação do canal"
        sub={itens.length ? `${feitos} de ${itens.length} ${itens.length === 1 ? 'passo feito' : 'passos feitos'}. O canal sai de implantação pela gestão, em Configurações.` : undefined}
      />
      {itens.length === 0 ? (
        <Empty className="gap-3 px-4">
          <p>O canal está em implantação, mas não tem passos de implantação no playbook.</p>
          {ehGestao && (
            <button type="button" className="btn-outline min-h-11" onClick={() => navegar('/configuracoes?secao=marketing')}>
              Montar o checklist
            </button>
          )}
        </Empty>
      ) : (
        <div>
          {itens.map((i) => {
            const linha = { chave: `item:${i.id}`, tipo: 'item', id: i.id };
            return (
              <LinhaTarefa
                key={i.id}
                titulo={i.titulo}
                canal={null}
                prazo={null}
                responsavel={nomeDoResponsavel({ responsavelId: i.responsavelId }, pessoas)}
                feito={!!i.concluidoEm}
                hoje={hoje}
                desabilitado={!podeGravar}
                onConcluir={(feito) => concluirLinha(linha, feito)}
                onAbrir={() => abrir({ tipo: 'item', id: i.id })}
                onSair={() => sairLinha(linha.chave)}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* Uma rotina ou um gatilho na lista do canal: toque abre o detalhe. */
function LinhaRotina({ item, detalhe, pessoas, onAbrir }) {
  const nome = nomeDoResponsavel({ responsavelId: item.responsavelId }, pessoas);
  return (
    <button type="button" className="mkt-linha" onClick={onAbrir}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-800">{item.titulo}</span>
        <span className="block truncate text-xs text-slate-500">{detalhe}</span>
      </span>
      {nome ? <Avatar nome={nome} tamanho="h-7 w-7 text-[10px] avatar-linha" /> : null}
    </button>
  );
}

function RotinasDoCanal({ canal }) {
  const { painel, pessoas, abrir } = useMarketing();
  const { rotinas, gatilhos } = useMemo(() => rotinasDoCanal(painel.playbook, canal.id), [painel.playbook, canal.id]);
  if (!rotinas.length && !gatilhos.length) return null;
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle titulo="Rotinas do canal" sub="Entram na agenda de cada pessoa na próxima etapa. Por enquanto ficam aqui para consulta." />
      {rotinas.length > 0 && (
        <div>
          {rotinas.map((i) => (
            <LinhaRotina key={i.id} item={i} detalhe={textoRecorrencia(i)} pessoas={pessoas} onAbrir={() => abrir({ tipo: 'item', id: i.id })} />
          ))}
        </div>
      )}
      {gatilhos.length > 0 && (
        <>
          <h3 className="label mt-4">Quando acontecer</h3>
          <div>
            {gatilhos.map((i) => (
              <LinhaRotina
                key={i.id}
                item={i}
                detalhe={`Evento: ${i.gatilho || 'não informado'}`}
                pessoas={pessoas}
                onAbrir={() => abrir({ tipo: 'item', id: i.id })}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function FazerDoCanal({ canal }) {
  const { painel, hoje, pessoas, canaisPorId, podeGravar, abrir, concluirLinha, sairLinha, mantidos } = useMarketing();
  const { quem, setQuem, temPessoa, idPessoa } = useFiltroQuem();
  const linhas = useMemo(
    () => linhasFazer({ acoes: painel.acoes, playbook: painel.playbook, canalId: canal.id, mantidos, semImplantacao: canal.emImplantacao, idPessoa }),
    [painel.acoes, painel.playbook, canal.id, canal.emImplantacao, mantidos, idPessoa]
  );
  const novaAcao = () => abrir({ tipo: 'acao', canalId: canal.id });
  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <SectionTitle
          titulo="Fazer"
          sub={`Ações abertas e itens do playbook de ${canal.nome} que ainda faltam.`}
          acao={
            <div className="flex flex-wrap items-center gap-2">
              {temPessoa && <Segmented opcoes={QUEM} valor={quem} onChange={setQuem} />}
              {podeGravar && (
                <button type="button" className="btn-primary min-h-11" onClick={novaAcao}>
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
          onAbrir={(l) => abrir({ tipo: l.tipo === 'acao' ? 'acao' : 'item', id: l.id })}
          onSair={sairLinha}
          vazio={
            <Empty className="gap-3 px-4">
              <p>{quem === 'minhas' ? 'Nada pendente com o seu nome neste canal.' : 'Nada pendente neste canal.'}</p>
              {podeGravar && (
                <button type="button" className="btn-outline min-h-11" onClick={novaAcao}>
                  Nova ação para {canal.nome}
                </button>
              )}
            </Empty>
          }
        />
      </Card>
      <RotinasDoCanal canal={canal} />
    </div>
  );
}

export default function CanalAberto({ canal }) {
  const [sub, setSub] = useParamNavegavel('sub', 'fazer', SUBS);
  return (
    <div className="space-y-5">
      <CabecalhoCanal canal={canal} />
      {canal.emImplantacao && <Implantacao canal={canal} />}
      <Segmented opcoes={SUBS_CANAL} valor={sub} onChange={setSub} />
      {sub === 'fazer' && <FazerDoCanal canal={canal} />}
      {sub === 'resultados' && <Resultados canal={canal} />}
      {sub === 'calendario' && <Calendario canal={canal} />}
      {sub === 'historico' && <Historico canal={canal} />}
    </div>
  );
}
