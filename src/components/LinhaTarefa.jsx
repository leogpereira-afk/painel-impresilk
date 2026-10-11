/* A LINHA DE TAREFA do Fazer: uma linha de 44px com o check, o título, o
 * ponto do canal, o prazo curto e as iniciais de quem faz.
 *
 * Mesma família visual da lista de trabalho (lista.jsx): fio claro entre as
 * linhas, trilho colorido à esquerda só no que pede ação (atrasada, vence
 * logo), Avatar para a pessoa. Não usa a LinhaLista direto porque ela tem
 * py-3 fixo: com o alvo de toque de 44px dentro, a linha passaria de 68px.
 *
 * CONCLUIR NA LINHA, COM DESFAZER. Marcar o check chama onConcluir(true) NA
 * HORA (gravar no servidor já), e a linha mostra "Concluída · Desfazer" por
 * 6 segundos; Desfazer chama onConcluir(false). Gravar na hora, e não depois
 * dos 6 s, é de propósito: fechar a aba no meio da espera perderia a
 * conclusão calada. O banco aceita desmarcar (painel_mkt_concluir_playbook
 * com p_feito false).
 *
 * O QUE A PÁGINA PRECISA SABER:
 *  - onConcluir(feito) pode devolver uma Promise. Se ela falhar, a linha volta
 *    ao que era e mostra o motivo embaixo. Se devolver `false`, a linha volta
 *    sem erro: é o caso da tarefa que pede evidência (a página abre a Gaveta
 *    para pedir o link e conclui por lá);
 *  - a página só tira a linha da lista quando onSair for chamado (fim dos 6 s).
 *    Se tirar antes, o Desfazer some junto com a linha;
 *  - `responsavel` é o nome já resolvido pelo id_pessoa (texto ou {nome});
 *  - `canal` é o canal da tela ({nome, cor});
 *  - `tom` (ok, warn, bad) troca a régua do prazo quando a página sabe mais
 *    (sem ele, vale a régua de prazoCurto: passou é vermelho, vence em até
 *    48h é âmbar);
 *  - `desabilitado`: quem só vê (papel visualização) não marca nada; o título
 *    continua abrindo o detalhe.
 */
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Avatar, TRILHO } from './lista.jsx';
import { corDoCanal } from './ChipCanal.jsx';
import { prazoCurto } from '../lib/calc/marketing-canais.js';
import './marketing-kit.css';

export const SEGUNDOS_DESFAZER = 6;

const TOM_PRAZO = { bad: 'text-bad-700', warn: 'text-warn-700', ok: 'text-ok-700', neutral: 'text-slate-500' };

export default function LinhaTarefa({
  titulo,
  canal,
  prazo,
  responsavel,
  tom,
  feito = false,
  onConcluir,
  onAbrir,
  onSair,
  desabilitado = false,
  hoje,
}) {
  // `otimista` é o que a linha mostra enquanto o servidor não devolve o
  // `feito` novo; some quando a página confirma.
  const [otimista, setOtimista] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [desfazer, setDesfazer] = useState(false);
  const [erro, setErro] = useState('');
  const relogio = useRef(null);
  const montada = useRef(true);
  // O onSair mais novo, para o relógio de 6 s não chamar a função de um
  // render antigo.
  const sair = useRef(onSair);
  useEffect(() => {
    sair.current = onSair;
  }, [onSair]);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
      clearTimeout(relogio.current);
    };
  }, []);
  useEffect(() => {
    if (otimista !== null && !!feito === otimista) setOtimista(null);
  }, [feito, otimista]);

  const mostrado = otimista ?? !!feito;
  const travado = desabilitado || typeof onConcluir !== 'function';

  async function mudar(proximo) {
    if (ocupado || travado) return;
    clearTimeout(relogio.current);
    setDesfazer(false);
    setErro('');
    setOcupado(true);
    setOtimista(proximo);
    try {
      const r = await onConcluir(proximo);
      if (!montada.current) return;
      if (r === false) {
        setOtimista(null);
        return;
      }
      if (proximo) {
        setDesfazer(true);
        relogio.current = setTimeout(() => {
          if (!montada.current) return;
          setDesfazer(false);
          sair.current?.();
        }, SEGUNDOS_DESFAZER * 1000);
      }
    } catch (e) {
      if (!montada.current) return;
      setOtimista(null);
      setErro(e?.message || 'Não foi possível gravar. Tente de novo.');
    } finally {
      if (montada.current) setOcupado(false);
    }
  }

  const pz = prazoCurto(prazo, hoje);
  const tomFinal = mostrado ? 'neutral' : TOM_PRAZO[tom] ? tom : pz.tom;
  const cor = corDoCanal(canal);
  const nomeResponsavel = typeof responsavel === 'string' ? responsavel : responsavel?.nome || '';
  const rotulo = titulo || 'Tarefa sem título';

  return (
    <div className="relative border-t first:border-0" style={{ borderColor: 'var(--fio-lista, #f0f0f5)' }}>
      <span className={clsx('absolute inset-y-0 left-0 w-[3px]', TRILHO[tomFinal] || TRILHO.neutral)} aria-hidden="true" />
      <div className="flex min-h-11 items-center gap-2 pl-1 pr-3 transition-colors hover:bg-slate-50">
        <label
          className={clsx('grid h-11 w-11 shrink-0 place-items-center', travado ? 'cursor-not-allowed' : 'cursor-pointer')}
          title={desabilitado ? 'Você pode ver, mas não marcar' : undefined}
        >
          <input
            type="checkbox"
            className="h-5 w-5 cursor-[inherit] accent-brand"
            checked={mostrado}
            disabled={travado || ocupado}
            aria-busy={ocupado || undefined}
            aria-label={mostrado ? `Reabrir: ${rotulo}` : `Concluir: ${rotulo}`}
            onChange={(e) => mudar(e.target.checked)}
          />
        </label>

        {typeof onAbrir === 'function' ? (
          <button
            type="button"
            onClick={onAbrir}
            className={clsx(
              'h-11 min-w-0 flex-1 truncate text-left text-sm',
              mostrado ? 'text-slate-400 line-through' : 'text-slate-800 hover:underline'
            )}
            title={rotulo}
          >
            {rotulo}
          </button>
        ) : (
          <span className={clsx('min-w-0 flex-1 truncate text-sm', mostrado ? 'text-slate-400 line-through' : 'text-slate-800')} title={rotulo}>
            {rotulo}
          </span>
        )}

        {canal?.nome && (
          <span className="flex shrink-0 items-center gap-1.5" title={canal.nome}>
            <span
              className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', !cor && 'border border-slate-200')}
              style={cor ? { backgroundColor: cor } : undefined}
              aria-hidden="true"
            />
            {/* No celular só o ponto (a linha não tem largura); o nome vai para
                o leitor de tela. Do sm para cima, o nome aparece. */}
            <span className="sr-only">Canal {canal.nome}</span>
            <span className="hidden max-w-[7rem] truncate text-xs text-slate-500 sm:inline" aria-hidden="true">
              {canal.nome}
            </span>
          </span>
        )}

        {desfazer ? (
          <span className="flex shrink-0 items-center gap-1 text-xs">
            <span role="status" className="text-ok-700">
              Concluída ·
            </span>
            <button
              type="button"
              onClick={() => mudar(false)}
              disabled={ocupado}
              className="min-h-11 px-1 font-display text-sm font-medium text-brand-700 hover:underline"
            >
              Desfazer
            </button>
          </span>
        ) : (
          <span className={clsx('shrink-0 font-display text-xs', mostrado ? 'text-ok-700' : TOM_PRAZO[tomFinal])}>
            {mostrado ? 'Concluída' : pz.texto}
          </span>
        )}

        {nomeResponsavel ? (
          // avatar-linha: no escuro as iniciais (text-brand-ink, sem par em
          // index.css) somem no fundo; marketing-kit.css clareia só aqui.
          <Avatar nome={nomeResponsavel} tamanho="h-7 w-7 text-[10px] avatar-linha" />
        ) : (
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-dashed border-slate-200"
            title="Sem responsável"
          >
            <span className="sr-only">Sem responsável</span>
          </span>
        )}
      </div>
      {erro && (
        <p role="alert" className="px-4 pb-2 text-xs text-bad-700">
          Não gravou: {erro}
        </p>
      )}
    </div>
  );
}
