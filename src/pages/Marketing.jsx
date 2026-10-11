/* MARKETING: o Centro de Comando (etapa a2, 11/10/2026).
 *
 * Contrato em docs/marketing/a2-contrato.md, seção 4. O que esta página faz:
 *  - topo de uma linha (título, frase curta e o botão fixo "Materiais e
 *    Drive", ?v=materiais), o conteúdo que esta página inteira era até a a1,
 *    sem mudar nada (MateriaisDrive.jsx);
 *  - a fileira de chips presa no topo: "Visão geral" e um chip por canal
 *    ativo ou em implantação, na ordem cadastrada (?v=geral ou ?v=<código>),
 *    com um fio entre os grupos (digital, contato, offline), setas e roda do
 *    mouse para rolar de lado (marketing/Fileira.jsx);
 *  - a Visão geral (Fazer de todos os canais, números e a lista "Ações e
 *    resultados") e o canal aberto (Fazer, Resultados, Calendário e
 *    Histórico, em ?sub=);
 *  - o detalhe de ação, publicação, item ou números abre na Gaveta.
 *
 * UMA LEITURA SÓ, UM ESTADO SÓ. A página lê o "painel" do servidor uma vez e
 * todas as vistas desenham a partir dele (contexto.js). Gravou, a linha
 * devolvida pelo servidor troca a antiga no mesmo estado: a ação concluída
 * no Fazer some da lista, do chip e dos números no mesmo instante, sem uma
 * segunda cópia que discorde da primeira.
 *
 * QUEM VÊ O QUÊ: o papel vem do servidor (gestão, marketing, visualização).
 * A tela só esconde botão; quem recusa de verdade é o servidor (403).
 *
 * ENDEREÇO: só o código do canal, o nome da sub-aba e o mês vão para a URL.
 * Nenhum cliente, valor ou pessoa. O ?aba=materiais antigo continua abrindo
 * os materiais (vira ?v=materiais).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderOpen, Info, LayoutGrid, X } from 'lucide-react';
import ChipCanal from '../components/ChipCanal.jsx';
import { SEGUNDOS_DESFAZER } from '../components/LinhaTarefa.jsx';
import { Skeleton, ErroModulo, AvisoAtualizacao } from '../components/ui.jsx';
import { useParamNavegavel } from '../hooks/useParamNavegavel.js';
import { ymdLocal } from '../lib/format.js';
import { lerPainelMarketing, listarPessoasMarketing, salvarAcaoMarketing, concluirPlaybook } from '../services/marketing.js';
import { SITUACOES_ACAO } from '../../supabase/functions/_shared/marketing.mjs';
import { MarketingCtx, useCelular, mudouNoServidor } from '../components/marketing/contexto.js';
import { avisarSemIdentidade } from '../lib/calc/marketing-conexoes.js';
import {
  ROTULO_GRUPO_CANAL,
  SITUACAO_AO_CONCLUIR,
  acaoComSituacao,
  canaisDaFileira,
  linhasFazer,
  resumoDosCanais,
  trechosDaFileira,
  trocarMetricas,
  trocarPorId,
} from '../components/marketing/derivar.js';
import Fileira from '../components/marketing/Fileira.jsx';
import VisaoGeral from '../components/marketing/VisaoGeral.jsx';
import CanalAberto from '../components/marketing/CanalAberto.jsx';
import MateriaisDrive from '../components/marketing/MateriaisDrive.jsx';
import GavetaDoMarketing from '../components/marketing/Gavetas.jsx';
import '../components/marketing/marketing.css';

const PAPEIS = ['gestao', 'marketing', 'visualizacao'];
const LISTAS = ['canais', 'playbook', 'acoes', 'publicacoes', 'metricas'];
// A frase de apoio do topo: à vista do sm para cima (com reticências, se
// faltar lugar, e por isso também no title), e no celular só para o leitor
// de tela.
const FRASE_DO_TOPO = 'O que fazer, os números e os materiais de cada canal.';

/* A resposta do "painel" no formato que as vistas usam. Lista que faltou
   NÃO vira lista vazia: zero publicações é uma medida, e a tela não pode
   afirmar o que não leu. Se o servidor respondeu sem as listas da a2 (a
   função antiga ainda no ar), a página diz isso em vez de mostrar zeros. */
function normalizarPainel(r) {
  if (LISTAS.some((k) => !Array.isArray(r?.[k]))) {
    throw new Error('O servidor do Marketing ainda está na versão anterior. Tente de novo em alguns minutos.');
  }
  return {
    // Papel desconhecido vale o menor: ver sem gravar.
    papel: PAPEIS.includes(r.papel) ? r.papel : 'visualizacao',
    idPessoa: r.idPessoa || null,
    canais: r.canais,
    playbook: r.playbook,
    acoes: r.acoes,
    publicacoes: r.publicacoes,
    metricas: r.metricas,
    papeis: Array.isArray(r.papeis) ? r.papeis : [],
    legado: { pendentes: Number(r.legado?.pendentes) || 0 },
    podeMigrar: r.podeMigrar === true,
    // O login não está ligado a uma pessoa do RH (campo novo do "painel").
    // Só true ou false do servidor contam: sem o campo (função antiga), null,
    // e nada é dito.
    semIdentidade: typeof r.semIdentidade === 'boolean' ? r.semIdentidade : null,
  };
}

function Aviso({ aviso, onFechar }) {
  if (!aviso) return null;
  const ok = aviso.tom !== 'erro';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      // Preso ao pé da tela: no celular, quem mexeu lá embaixo na lista não
      // via o aviso que nascia no topo (o erro passava calado).
      className={`sem-impressao fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-xl items-start justify-between gap-2 rounded-lg px-3 py-1 text-sm shadow-lg ${ok ? 'bg-ok-50 text-ok-700' : 'bg-bad-50 text-bad-700'}`}
    >
      <p className="min-w-0 flex-1 break-words py-2">{aviso.texto}</p>
      <button type="button" className="btn-ghost h-11 w-11 shrink-0 p-0" onClick={onFechar} aria-label="Fechar aviso">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function Carregando() {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando o Marketing">
      <Skeleton className="h-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function Marketing() {
  const [params, setParams] = useSearchParams();
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState('');
  const [pessoas, setPessoas] = useState(null);
  const [erroPessoas, setErroPessoas] = useState('');
  const [aviso, setAviso] = useState(null);
  const [gaveta, setGaveta] = useState(null);
  // Linhas do Fazer que já estão feitas mas continuam na tela enquanto o
  // "Desfazer" da LinhaTarefa está à vista (saem no onSair, 6 s depois).
  const [mantidos, setMantidos] = useState(() => new Set());
  const celular = useCelular();
  // Um "hoje" por render, o mesmo para todas as contas da tela.
  const hoje = ymdLocal(new Date());

  const vivo = useRef(true);
  const painelAtual = useRef(null);
  const statusAntes = useRef(new Map());
  const relogioAviso = useRef(null);
  const relogiosMantidos = useRef(new Map());
  const topo = useRef(null);
  const primeiraVista = useRef(true);

  useEffect(() => {
    vivo.current = true;
    const relogios = relogiosMantidos.current;
    return () => {
      vivo.current = false;
      clearTimeout(relogioAviso.current);
      for (const r of relogios.values()) clearTimeout(r);
    };
  }, []);
  useEffect(() => {
    painelAtual.current = painel;
  }, [painel]);

  const carregar = useCallback(async () => {
    try {
      const r = normalizarPainel(await lerPainelMarketing());
      if (!vivo.current) return false;
      setPainel(r);
      setErro('');
      return true;
    } catch (e) {
      if (vivo.current) setErro(e?.message || 'Não foi possível carregar o Marketing.');
      return false;
    }
  }, []);

  // As pessoas vêm à parte: se a lista do RH falhar, o Marketing abre do
  // mesmo jeito, e só o campo de responsável avisa e oferece tentar de novo.
  const carregarPessoas = useCallback(async () => {
    setErroPessoas('');
    try {
      const r = await listarPessoasMarketing();
      if (vivo.current) setPessoas(Array.isArray(r.pessoas) ? r.pessoas : []);
    } catch (e) {
      if (vivo.current) setErroPessoas(e?.message || 'Não foi possível ler as pessoas.');
    }
  }, []);

  useEffect(() => {
    carregar();
    carregarPessoas();
  }, [carregar, carregarPessoas]);

  // ?aba=materiais (endereço de antes da a2) passa a ser ?v=materiais.
  const abaAntiga = params.get('v') === null && params.get('aba') === 'materiais';
  useEffect(() => {
    if (!abaAntiga) return;
    setParams(
      (atuais) => {
        const c = new URLSearchParams(atuais);
        c.delete('aba');
        c.set('v', 'materiais');
        return c;
      },
      { replace: true }
    );
  }, [abaAntiga, setParams]);

  const fileira = useMemo(() => (painel ? canaisDaFileira(painel.canais) : []), [painel]);
  const trechos = useMemo(() => trechosDaFileira(fileira), [fileira]);
  const codigos = useMemo(() => fileira.map((c) => c.codigo), [fileira]);
  const [vUrl, setV] = useParamNavegavel('v', 'geral', (x) => x === 'geral' || x === 'materiais' || codigos.includes(x), {
    limpar: ['sub', 'mes', 'aba'],
  });
  const vista = abaAntiga ? 'materiais' : vUrl;
  const canal = fileira.find((c) => c.codigo === vista) || null;
  // Enquanto os canais carregam, ?v=instagram ainda não tem chip: nenhum
  // chip fica aceso (acender a Visão geral e trocar para o canal um segundo
  // depois parece clique errado).
  const vBruto = params.get('v');
  const geralAceso = painel ? vista !== 'materiais' && !canal : !abaAntiga && (!vBruto || vBruto === 'geral');

  const resumo = useMemo(() => (painel ? resumoDosCanais(painel, hoje) : new Map()), [painel, hoje]);
  const idsDaFileira = useMemo(() => new Set(fileira.map((c) => c.id)), [fileira]);
  const totalPendentes = useMemo(
    () => (painel ? linhasFazer({ acoes: painel.acoes, playbook: painel.playbook, canaisDoPlaybook: idsDaFileira }).filter((l) => !l.feito).length : null),
    [painel, idsDaFileira]
  );
  const canaisPorId = useMemo(() => new Map((painel?.canais || []).map((c) => [c.id, c])), [painel]);

  // Trocou de chip com a página rolada lá embaixo: volta para o começo do
  // conteúdo novo (a fileira fica no topo), em vez de abrir o canal pelo meio.
  useEffect(() => {
    if (primeiraVista.current) {
      primeiraVista.current = false;
      return;
    }
    const el = topo.current;
    if (!el) return;
    // O fim do título é onde a fileira começa.
    const y = el.getBoundingClientRect().bottom + window.scrollY;
    if (window.scrollY > y) window.scrollTo({ top: y });
  }, [vista]);

  const avisar = useCallback((texto, tom = 'ok') => {
    clearTimeout(relogioAviso.current);
    setAviso({ texto, tom });
    // Aviso de que deu certo some sozinho; o de erro fica até a pessoa ler.
    if (tom !== 'erro') relogioAviso.current = setTimeout(() => vivo.current && setAviso(null), 8000);
  }, []);

  const abrir = useCallback((pedido) => setGaveta({ ...pedido, n: Date.now() }), []);
  const fecharGaveta = useCallback(() => setGaveta(null), []);
  const sairLinha = useCallback(
    (chave) =>
      setMantidos((m) => {
        if (!m.has(chave)) return m;
        const n = new Set(m);
        n.delete(chave);
        return n;
      }),
    []
  );

  // As trocas no estado, uma por tipo de linha. O servidor devolve a linha
  // inteira já gravada (com a versão nova); ela toma o lugar da antiga.
  const trocar = useMemo(
    () => ({
      acao: (a) => setPainel((p) => p && { ...p, acoes: trocarPorId(p.acoes, a) }),
      item: (i) => setPainel((p) => p && { ...p, playbook: trocarPorId(p.playbook, i) }),
      publicacao: (x) => setPainel((p) => p && { ...p, publicacoes: trocarPorId(p.publicacoes, x) }),
      metricas: (m) => setPainel((p) => p && { ...p, metricas: trocarMetricas(p.metricas, m) }),
      canal: (c) => setPainel((p) => p && { ...p, canais: trocarPorId(p.canais, c) }),
    }),
    []
  );
  const tirar = useMemo(
    () => ({
      acao: (id) => setPainel((p) => p && { ...p, acoes: p.acoes.filter((a) => a.id !== id) }),
      publicacao: (id) => setPainel((p) => p && { ...p, publicacoes: p.publicacoes.filter((x) => x.id !== id) }),
    }),
    []
  );

  /* CONCLUIR NA LINHA DO FAZER (e desfazer). A LinhaTarefa chama isto na
     hora do toque e mostra "Concluída · Desfazer" por 6 s.
     - Ação: a situação vai para "Encerrada"; a situação de antes fica
       guardada para o Desfazer devolver a mesma.
     - Item único do playbook: concluir no banco. Item que pede link ou texto
       como evidência não se conclui no escuro: a linha volta (devolve false)
       e a gaveta abre pedindo a evidência.
     Erro sobe para a LinhaTarefa, que volta a linha e mostra o motivo. Se o
     motivo é "outra pessoa mexeu", a lista é relida para a próxima
     tentativa já sair com a versão nova. */
  const concluirLinha = useCallback(
    async (l, feito) => {
      const p = painelAtual.current;
      if (!p) return false;
      // A linha concluída fica na tela até o onSair da LinhaTarefa (6 s). Se
      // a lista sair da tela antes (trocou de chip ou de sub-aba), o onSair
      // nunca vem: este relógio da página tira a linha do mesmo jeito, senão
      // ela ficaria riscada no Fazer até recarregar.
      const manter = (sim) => {
        clearTimeout(relogiosMantidos.current.get(l.chave));
        relogiosMantidos.current.delete(l.chave);
        if (sim) {
          relogiosMantidos.current.set(
            l.chave,
            setTimeout(() => {
              relogiosMantidos.current.delete(l.chave);
              if (vivo.current) sairLinha(l.chave);
            }, SEGUNDOS_DESFAZER * 1000 + 500)
          );
        }
        setMantidos((m) => {
          const n = new Set(m);
          if (sim) n.add(l.chave);
          else n.delete(l.chave);
          return n;
        });
      };
      // Desfazer: o relógio da página para enquanto o pedido anda. Senão ele
      // tirava a linha no meio de um pedido lento, e um erro do desfazer
      // sumia junto com ela.
      if (!feito) {
        clearTimeout(relogiosMantidos.current.get(l.chave));
        relogiosMantidos.current.delete(l.chave);
      }
      try {
        if (l.tipo === 'acao') {
          const a = p.acoes.find((x) => x.id === l.id);
          if (!a) throw new Error('Esta ação não existe mais. Recarregue a página.');
          const status = feito ? SITUACAO_AO_CONCLUIR : statusAntes.current.get(l.chave) || SITUACOES_ACAO[0];
          const salva = await salvarAcaoMarketing(acaoComSituacao(a, status), a.versao);
          if (feito) statusAntes.current.set(l.chave, a.status);
          else statusAntes.current.delete(l.chave);
          if (vivo.current) {
            trocar.acao(salva);
            manter(feito);
          }
          return true;
        }
        const i = p.playbook.find((x) => x.id === l.id);
        if (!i || i.ativo === false) throw new Error('Este item do playbook não existe mais. Recarregue a página.');
        if (feito && (i.evidencia === 'link' || i.evidencia === 'texto')) {
          abrir({ tipo: 'item', id: i.id });
          return false;
        }
        const salvo = await concluirPlaybook(i.id, i.versao, feito);
        if (vivo.current) {
          trocar.item(salvo);
          manter(feito);
        }
        return true;
      } catch (e) {
        if (mudouNoServidor(e)) carregar();
        // O desfazer falhou: a linha continua concluída. O aviso da página
        // fica até a pessoa ler (a linha sai sozinha logo depois).
        if (!feito && vivo.current) {
          manter(true);
          avisar(`Não deu para desfazer: ${e?.message || 'tente de novo'}`, 'erro');
        }
        throw e;
      }
    },
    [abrir, avisar, carregar, trocar, sairLinha]
  );

  const ctx = useMemo(
    () =>
      painel && {
        painel,
        hoje,
        papel: painel.papel,
        podeGravar: painel.papel !== 'visualizacao',
        ehGestao: painel.papel === 'gestao',
        pessoas,
        erroPessoas,
        recarregarPessoas: carregarPessoas,
        canaisPorId,
        idsDaFileira,
        trocar,
        tirar,
        recarregar: carregar,
        avisar,
        abrir,
        sairLinha,
        concluirLinha,
        mantidos,
        celular,
      },
    [painel, hoje, pessoas, erroPessoas, carregarPessoas, canaisPorId, idsDaFileira, trocar, tirar, carregar, avisar, abrir, sairLinha, concluirLinha, mantidos, celular]
  );

  let conteudo;
  // Os materiais abrem mesmo sem o painel (papel ainda desconhecido): aí
  // os botões aparecem, e a painel-ativos é quem recusa a visualização.
  if (vista === 'materiais') conteudo = <MateriaisDrive podeGravar={!painel || painel.papel !== 'visualizacao'} />;
  else if (!painel && erro) conteudo = <ErroModulo mensagem={erro} aoTentar={carregar} />;
  else if (!painel) conteudo = <Carregando />;
  else if (canal) conteudo = <CanalAberto key={canal.id} canal={canal} />;
  else conteudo = <VisaoGeral />;

  return (
    <MarketingCtx.Provider value={ctx}>
      <div className="mkt-pagina">
        {/* O topo numa linha: título, frase curta (no celular ela sai do
            desenho e fica para o leitor de tela; `relative` segura o recorte
            dela aqui dentro) e o botão. O botão é desenhado com 36px e toca
            em 44px (.alvo-44). */}
        <div ref={topo} className="mkt-topo">
          <div className="relative flex min-w-0 items-baseline gap-3">
            <h1 className="mkt-titulo shrink-0 font-display font-bold tracking-tight text-slate-900">Marketing</h1>
            <p className="mkt-topo-frase text-slate-500" title={FRASE_DO_TOPO}>
              {FRASE_DO_TOPO}
            </p>
          </div>
          <button
            type="button"
            className={`${vista === 'materiais' ? 'btn-primary' : 'btn-outline'} alvo-44 min-h-9 shrink-0 px-3 py-1.5`}
            aria-pressed={vista === 'materiais'}
            onClick={() => setV('materiais')}
          >
            <FolderOpen size={16} strokeWidth={2.2} aria-hidden="true" />
            Materiais e Drive
          </button>
        </div>

        <Fileira rotulo="Canais do Marketing" escolhido={geralAceso ? 'geral' : vista} quantos={fileira.length}>
          <ChipCanal
            canal={{ nome: 'Visão geral' }}
            icone={LayoutGrid}
            pendentes={totalPendentes}
            ativo={geralAceso}
            compacto
            onClick={() => setV('geral')}
          />
          {painel
            ? trechos.map((t, i) => (
                // Um trecho por grupo seguido (digital, contato, offline), com
                // o fio na frente (marketing.css). A ordem cadastrada manda:
                // derivar.js, trechosDaFileira.
                <div key={`${t.grupo}-${i}`} role="group" aria-label={ROTULO_GRUPO_CANAL[t.grupo] || 'Outros canais'} className="mkt-fileira-grupo">
                  {t.canais.map((c) => {
                    const r = resumo.get(c.id);
                    return (
                      <ChipCanal
                        key={c.id}
                        canal={c}
                        indicador={r?.indicador}
                        pendentes={r?.pendentes}
                        semaforo={r?.semaforo}
                        ativo={vista === c.codigo}
                        compacto
                        onClick={() => setV(c.codigo)}
                      />
                    );
                  })}
                </div>
              ))
            : !erro && [0, 1, 2].map((n) => <Skeleton key={n} className="h-9 w-24 shrink-0 rounded-full" />)}
        </Fileira>

        {painel && erro && vista !== 'materiais' && <AvisoAtualizacao erro={erro} aoTentar={carregar} />}
        {/* Login sem pessoa do RH: só a gestão lê, numa linha discreta. Sem
            a ligação, o filtro "Minhas" some e o papel definido por pessoa
            não alcança este login. */}
        {avisarSemIdentidade(painel) && vista !== 'materiais' && (
          <p className="flex items-start gap-1.5 px-1 text-xs text-slate-500">
            <Info size={14} aria-hidden="true" className="mt-px shrink-0" />
            Seu login não está ligado a uma pessoa do RH, por isso o filtro Minhas não aparece.
          </p>
        )}
        <Aviso aviso={aviso} onFechar={() => setAviso(null)} />

        {conteudo}
      </div>
      {/* A gaveta fica FORA do space-y: o <dialog> é irmão dos blocos e o
          margin-top que o space-y dá a todo irmão empurrava a gaveta para
          baixo da tela (o rodapé com o Salvar sumia). */}
      {ctx && gaveta && <GavetaDoMarketing key={gaveta.n} gaveta={gaveta} onFechar={fecharGaveta} />}
    </MarketingCtx.Provider>
  );
}
