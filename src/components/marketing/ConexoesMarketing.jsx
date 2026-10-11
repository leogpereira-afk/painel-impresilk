/* CONFIGURAÇÕES > MARKETING > CONEXÕES (integrações, 11/10/2026).
 *
 * Uma linha compacta por fonte de dados (Site, Google, Meta, Google Ads,
 * LinkedIn, Pinterest): o selo do estado (com o texto, não só a cor), a conta,
 * a última coleta, as partes (o Google: Analytics, Search Console e Perfil,
 * cada uma com o estado e o motivo em texto), o que falta (os NOMES dos
 * secrets, nunca valor) e os botões do papel de quem olha. "Como ligar",
 * recolhido em cada linha, é o passo a passo do dono (conexoes-passos.js).
 * As contas de cada linha moram em lib/calc/marketing-conexoes.js.
 *
 * QUEM VÊ O QUÊ: todos os papéis veem as linhas; a gestão conecta, reconecta
 * e desconecta (só Google, LinkedIn e Pinterest); gestão e marketing pedem
 * "Atualizar agora". A tela só esconde botão; quem recusa é o servidor.
 *
 * O CONECTAR E A VOLTA (protocolo com confirmação): o Conectar guarda NESTA
 * ABA o nonce que o servidor devolveu e só então vai ao provedor. A volta
 * chega com ?conexao=<fonte>&r=ok&confirmar=<nonce>, e a tela só confirma
 * quando esse nonce é o guardado para aquela fonte (link de outra pessoa ou
 * de outra aba não confirma nada: o aviso pede para clicar em Conectar de
 * novo). Confirma UMA vez (o StrictMode monta o componente duas vezes; a
 * promessa de cada nonce fica no módulo), apaga o nonce da aba, lê as fontes
 * DEPOIS da confirmação (lida antes, a linha podia dizer "falta conectar"
 * embaixo do aviso "conectado") e tira os parâmetros da URL. A volta pode
 * chegar com o componente já montado (a prévia compilada usa HashRouter, e
 * lá a navegação não recarrega a página): por isso a URL é vigiada, e não
 * lida só na montagem.
 *
 * "ATUALIZAR AGORA": o servidor espera a coleta até uns 25 s. Terminou: a
 * linha troca na hora. Não deu tempo ({andando: true}): a linha diz
 * "coletando", a memória relê a fonte algumas vezes, cada vez mais espaçado,
 * e a cada retrato novo este bloco confere se a data da coleta mudou. A
 * trava de 2 minutos por fonte vira contagem no próprio botão.
 *
 * A LEITURA É A LEVE, PELA MEMÓRIA ÚNICA (dados/useFontesMarketing.js): o
 * estado das seis fontes, sem os "dados" (este bloco nunca mostra número).
 * A faixa da Visão geral lê pela mesma memória: as duas nunca discordam, e o
 * "Atualizar agora" daqui aparece lá (e na sub-aba Dados) sem outra leitura.
 * Quem decide QUANDO ler é este bloco: com o grupo aberto, depois da
 * confirmação da volta, e sempre de novo ao abrir (é aqui que se decide
 * conectar).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Selo } from '../lista.jsx';
import { Skeleton } from '../ui.jsx';
import { MenuMais } from '../CardCompacto.jsx';
import ComoLigar from './ComoLigar.jsx';
import { ymdLocal } from '../../lib/format.js';
import { TRAVA_COLETA_MS } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';
import { conectarInicioMarketing, confirmarConexaoMarketing, desconectarMarketing } from '../../services/marketing.js';
import { atualizarFontes, guardarFonte, lerFontes, useFontesMarketing } from './dados/useFontesMarketing.js';
import {
  LIMITE_DA_RELEITURA_MS,
  PARAMETRO_FOCO,
  PARAMETROS_DA_VOLTA,
  apagarNonceGuardado,
  avisoDaVolta,
  avisoDoDesconectar,
  botoesDaLinha,
  coletaTerminou,
  confirmacaoTransitoria,
  guardarNonce,
  lerFoco,
  lerNonceGuardado,
  lerVoltaDoOAuth,
  linhaDaConexao,
  perguntaDeDesconectar,
  rotuloDaFonte,
  semParametros,
  textoDaColetaAndando,
  textoDaColetaDemorada,
  textoDaColetaPronta,
  voltaDestaAba,
} from '../../lib/calc/marketing-conexoes.js';
import './conexoes.css';

/* UMA CONFIRMAÇÃO POR NONCE, por carga da página. O StrictMode monta o
   componente duas vezes em desenvolvimento, e a volta do OAuth não pode virar
   dois pedidos (o segundo daria "pedido vencido" e apagaria o "conectado"):
   a promessa fica aqui, e as duas montagens esperam a mesma. "Tentar de
   novo" (rede caiu) apaga a promessa e pede outra vez, com o mesmo nonce. */
const CONFIRMACOES = new Map();
function confirmarUmaVez(fonte, nonce, deNovo = false) {
  if (deNovo) CONFIRMACOES.delete(nonce);
  if (!CONFIRMACOES.has(nonce)) {
    CONFIRMACOES.set(
      nonce,
      confirmarConexaoMarketing(fonte, nonce).then(
        (f) => ({ ok: true, fonte: f }),
        (erro) => ({ ok: false, erro })
      )
    );
  }
  return CONFIRMACOES.get(nonce);
}

// O fundo e o texto de cada tom de aviso (todos com par no tema escuro).
const TOM_AVISO = {
  ok: 'bg-ok-50 text-ok-700',
  erro: 'bg-bad-50 text-bad-700',
  aviso: 'bg-warn-50 text-warn-700',
  neutro: 'bg-slate-100 text-slate-700',
};

function Aviso({ aviso, onFechar, children, className }) {
  if (!aviso) return null;
  return (
    <div role={aviso.tom === 'erro' ? 'alert' : 'status'} className={clsx('mkt-conexao-aviso', TOM_AVISO[aviso.tom] || TOM_AVISO.neutro, className)}>
      <p className="min-w-0 flex-1 break-words">
        {aviso.texto}
        {children}
      </p>
      {onFechar && (
        <button type="button" className="btn-ghost alvo-40 h-7 w-7 shrink-0 p-0" onClick={onFechar} aria-label="Fechar aviso">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Uma parte da fonte: o nome, o estado em texto (com o ponto da cor) e, se
// não está funcionando, o motivo.
const PONTO = { ok: 'bg-ok-600', warn: 'bg-warn-600', bad: 'bg-bad-600', neutral: 'bg-slate-400' };
function Partes({ partes }) {
  const { lista, funcionando, total, resumidas } = partes;
  if (!total) return null;
  return (
    <div className="mkt-conexao-partes text-xs">
      {resumidas && (
        <p className="text-slate-600">
          {funcionando} de {total} partes funcionando
          {lista.length ? '; pedem atenção:' : '.'}
        </p>
      )}
      {lista.length > 0 && (
        <ul>
          {lista.map((p) => (
            <li key={p.chave} className={clsx(p.motivo && 'com-motivo')}>
              <span className={clsx('mkt-conexao-ponto', PONTO[p.info.tom] || PONTO.neutral)} aria-hidden="true" />
              <span className="text-slate-700">
                <span className="font-medium">{p.rotulo}:</span> {p.info.rotulo}
                {p.motivo && <span className="text-slate-500">. {p.motivo.replace(/\.$/, '')}.</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ROTULO_BOTAO = { atualizar: 'Atualizar agora', conectar: 'Conectar', reconectar: 'Reconectar' };

function LinhaConexao({ linha, ocupado, coletando, restante, aviso, aberto, onBotao, onAlternar, onFecharAviso }) {
  const { fonte, rotulo, situacao, conta, conectado, coleta, partes, detalhe, avisos, acoes, opcionais } = linha;
  const botoes = botoesDaLinha(acoes, situacao.chave);
  const idLigar = `como-ligar-${fonte}`;
  const idAvisos = `avisos-${fonte}`;
  const meta = [conta, conectado, coleta].filter(Boolean);
  const andando = coletando || situacao.andando;

  const rotuloDoBotao = (k) => {
    if (ocupado === k) return k === 'atualizar' ? 'Atualizando...' : 'Abrindo...';
    if (k === 'atualizar' && restante > 0) return `Atualizar em ${restante} s`;
    return ROTULO_BOTAO[k];
  };

  return (
    <li id={`conexao-${fonte}`} className="mkt-conexao" aria-busy={andando || undefined}>
      <div className="mkt-conexao-cabeca">
        <h4 className="font-display text-sm font-semibold text-slate-900">{rotulo}</h4>
        <Selo tom={situacao.tom} title={situacao.texto}>
          {situacao.rotulo}
        </Selo>
        {andando && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            coletando agora
          </span>
        )}
      </div>

      {(meta.length > 0 || avisos.length > 0) && (
        <p className="mkt-conexao-meta text-xs text-slate-500">
          {meta.map((m, i) => (
            <span key={m}>
              {i > 0 && ' · '}
              {m}
            </span>
          ))}
          {avisos.length > 0 && (
            <>
              {meta.length > 0 && ' · '}
              <button type="button" className="mkt-conexao-alterna alvo-40" aria-expanded={!!aberto.avisos} aria-controls={aberto.avisos ? idAvisos : undefined} onClick={() => onAlternar('avisos')}>
                {avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`}
                <ChevronDown size={12} aria-hidden="true" className={clsx('transition-transform', aberto.avisos && 'rotate-180')} />
              </button>
            </>
          )}
        </p>
      )}

      <Partes partes={partes} />
      {detalhe && <p className="mkt-conexao-detalhe text-xs text-slate-600">{detalhe}</p>}

      {(botoes.visiveis.length > 0 || botoes.menu.length > 0) && (
        <div className="mkt-conexao-botoes">
          {botoes.visiveis.map((k) => (
            <button
              key={k}
              type="button"
              className={clsx(k === botoes.primario ? 'btn-primary' : 'btn-outline', 'alvo-40 min-h-8 px-2.5 py-1 text-[13px]')}
              disabled={!!ocupado || (k === 'atualizar' && restante > 0)}
              title={k === 'atualizar' ? 'Uma coleta por fonte a cada 2 minutos.' : undefined}
              onClick={() => onBotao(k)}
            >
              {rotuloDoBotao(k)}
            </button>
          ))}
          {botoes.menu.length > 0 && (
            <MenuMais
              compacto
              rotulo={`Mais ações: ${rotulo}`}
              itens={botoes.menu.map((k) => ({
                id: k,
                rotulo: k === 'desconectar' ? 'Desconectar' : ROTULO_BOTAO[k],
                perigo: k === 'desconectar',
                desabilitado: !!ocupado,
                onClick: () => onBotao(k),
              }))}
            />
          )}
        </div>
      )}

      {/* "Como ligar" abre e fecha, não faz nada. No celular fica na ponta
          da linha do nome (a linha sem botão, da fonte sem os secrets ou do
          papel que só vê, não gasta uma linha só para ele, e os botões cabem
          numa linha); do sm para cima, na ponta direita, depois dos botões,
          no mesmo lugar em toda linha. Vem depois dos botões no HTML para o
          Tab seguir a ordem do computador (conexoes.css, a grade). */}
      <button
        type="button"
        className="mkt-conexao-ligar btn-ghost alvo-40 min-h-8 gap-1 px-2 py-1 text-[13px]"
        aria-expanded={!!aberto.ligar}
        aria-controls={aberto.ligar ? idLigar : undefined}
        onClick={() => onAlternar('ligar')}
      >
        Como ligar
        <ChevronDown size={14} aria-hidden="true" className={clsx('transition-transform', aberto.ligar && 'rotate-180')} />
      </button>

      {aviso && <Aviso aviso={aviso} onFechar={onFecharAviso} className="mkt-conexao-largo" />}
      {aberto.avisos && avisos.length > 0 && (
        <ul id={idAvisos} className="mkt-conexao-avisos mkt-conexao-largo text-xs text-slate-600">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {aberto.ligar && (
        <div className="mkt-conexao-largo">
          <ComoLigar fonte={fonte} id={idLigar} opcionais={opcionais} />
        </div>
      )}
    </li>
  );
}

export default function ConexoesMarketing() {
  const [params, setParams] = useSearchParams();
  // O retrato leve da memória única; a leitura é decidida aqui (auto: false).
  const { retrato, erro } = useFontesMarketing({ leve: true, auto: false });
  const [volta, setVolta] = useState(null);
  const [avisos, setAvisos] = useState({});
  const [ocupado, setOcupado] = useState({});
  const [coletando, setColetando] = useState({});
  const [travas, setTravas] = useState({});
  const [agora, setAgora] = useState(() => Date.now());
  const [abertos, setAbertos] = useState({});
  const [foco, setFoco] = useState(null);
  // Um "hoje" por render, o mesmo para todas as datas da tela.
  const hoje = ymdLocal(new Date());

  const vivo = useRef(true);
  // As coletas que a tela espera terminar: fonte -> {desde, inicio, minha}.
  // (Uma leitura que saiu antes de uma troca feita aqui não passa por cima
  // dela: quem cuida disso é a memória.)
  const seguidas = useRef(new Map());
  // O último retrato, para o relógio do limite conferir sem esperar desenho;
  // e os relógios do limite que ainda vão tocar.
  const ultimo = useRef(retrato);
  const relogios = useRef(new Set());
  // A confirmação da volta em andamento: a primeira leitura espera por ela.
  const confirmando = useRef(null);
  const consultaVista = useRef('');
  // O bloco mora dentro do grupo "Marketing" de Configurações, que abre e
  // fecha (<details>), e o grupo existe montado mesmo fechado. As fontes só
  // são lidas quando o grupo está aberto: quem abriu Configurações para
  // mexer no financeiro não baixa o retrato das seis fontes à toa. A volta
  // do Conectar abre o grupo (?secao=marketing) e é confirmada de qualquer
  // jeito.
  const raiz = useRef(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const grupo = raiz.current?.closest('details');
    if (!grupo) {
      setAberto(true);
      return undefined;
    }
    const ver = () => {
      if (grupo.open) setAberto(true);
    };
    ver();
    grupo.addEventListener('toggle', ver);
    return () => grupo.removeEventListener('toggle', ver);
  }, []);

  useEffect(() => {
    vivo.current = true;
    const r = relogios.current;
    return () => {
      vivo.current = false;
      for (const id of r) clearTimeout(id);
      r.clear();
    };
  }, []);

  useEffect(() => {
    ultimo.current = retrato;
  }, [retrato]);

  const avisar = useCallback((fonte, tom, texto) => setAvisos((a) => ({ ...a, [fonte]: texto ? { tom, texto } : null })), []);

  /* A LEITURA: leve, pela memória única, e sempre de novo (forçada). Nunca
     lança: devolve o retrato, ou null; a falha vira o `erro` da memória, e o
     retrato que estava na tela fica (o aviso diz que não atualizou). */
  const ler = useCallback(() => lerFontes({ leve: true, forcar: true }), []);

  /* AS COLETAS QUE CONTINUAM NO SERVIDOR. Quem relê é a memória (enquanto a
     fonte estiver "andando", nas esperas de ESPERAS_DA_RELEITURA_S); aqui,
     cada retrato novo confere todas as seguidas: terminou (a data mudou e
     não está mais andando), sai da lista com o aviso; passou do limite, sai
     com o aviso de que demorou. A coleta que já estava andando quando a
     tela abriu (a das 6h, ou a de outra pessoa) é seguida calada. */
  const conferirSeguidas = useCallback(
    (r) => {
      const fim = [];
      for (const [fonte, s] of seguidas.current) {
        const f = r?.porFonte?.[fonte];
        if (f && coletaTerminou(f, s.desde)) {
          fim.push(fonte);
          if (s.minha) avisar(fonte, 'ok', textoDaColetaPronta(f));
        } else if (Date.now() - s.inicio > LIMITE_DA_RELEITURA_MS) {
          fim.push(fonte);
          if (s.minha) avisar(fonte, 'neutro', textoDaColetaDemorada(rotuloDaFonte(f || { fonte })));
        }
      }
      for (const fonte of fim) seguidas.current.delete(fonte);
      if (fim.length) setColetando((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !fim.includes(k))));
    },
    [avisar]
  );
  // Todo retrato novo (a leitura daqui, a da faixa, as releituras da
  // memória e as trocas do "Atualizar agora") confere as seguidas.
  useEffect(() => {
    if (retrato && seguidas.current.size) conferirSeguidas(retrato);
  }, [retrato, conferirSeguidas]);
  const seguir = useCallback(
    (fonte, desde, minha) => {
      seguidas.current.set(fonte, { desde: desde ?? null, inicio: Date.now(), minha });
      setColetando((c) => ({ ...c, [fonte]: true }));
      // O limite: a memória para de reler quando o servidor deixa de dizer
      // "andando" (a coleta terminou, ou morreu). Passado ele sem a data
      // mudar, este relógio confere uma última vez, e a tela desiste com o
      // aviso de que demorou.
      const id = setTimeout(() => {
        relogios.current.delete(id);
        if (vivo.current) conferirSeguidas(ultimo.current);
      }, LIMITE_DA_RELEITURA_MS + 1000);
      relogios.current.add(id);
    },
    [conferirSeguidas]
  );

  /* A CONFIRMAÇÃO da volta do OAuth: guarda a etapa na `volta` (o aviso do
     topo sai dela) e põe na memória a fonte que o servidor devolveu (a faixa
     da Visão geral vê também). */
  const confirmar = useCallback(async (v, deNovo = false) => {
    setVolta({ ...v, etapa: 'confirmando' });
    const r = await confirmarUmaVez(v.fonte, v.nonce, deNovo);
    if (!vivo.current) return;
    if (r.ok) {
      if (r.fonte) guardarFonte(r.fonte);
      setVolta({ ...v, etapa: 'ok' });
      return;
    }
    const e = r.erro;
    setVolta({ ...v, etapa: confirmacaoTransitoria(e) ? 'falhou' : 'recusada', motivo: e?.motivo ?? null, mensagem: e?.message ?? '' });
  }, []);

  /* A URL: a volta do Conectar e o foco pedido pela faixa da Visão geral.
     Lidos uma vez por consulta (a mesma consulta, de novo, não confirma de
     novo) e tirados da URL com replace: nem o nonce nem o foco ficam no
     histórico, e um F5 não repete nada. */
  useEffect(() => {
    const consulta = params.toString();
    if (consultaVista.current === consulta) return;
    consultaVista.current = consulta;
    const v = lerVoltaDoOAuth(params);
    const f = lerFoco(params);
    if (v?.tipo === 'confirmar') {
      // Só o nonce que o Conectar desta aba guardou (ou um que esta página
      // já está confirmando). Usado, ele sai da aba.
      if (CONFIRMACOES.has(v.nonce) || voltaDestaAba(v, lerNonceGuardado(v.fonte))) {
        apagarNonceGuardado(v.fonte);
        confirmando.current = confirmar(v);
      } else {
        setVolta({ ...v, tipo: 'outra_aba' });
      }
    } else if (v) {
      setVolta(v);
    }
    if (f) setFoco(f);
    // O "secao" sai junto (só quando havia volta ou foco): a página de
    // Configurações rola até o grupo de novo a cada troca de consulta que
    // ainda tenha "secao", e essa segunda rolagem desfazia a ida até a linha
    // da fonte. O grupo já abriu na primeira, e fica aberto (lembrado no
    // aparelho).
    const limpa = semParametros(params, [...PARAMETROS_DA_VOLTA, PARAMETRO_FOCO]);
    if (limpa) {
      limpa.delete('secao');
      setParams(limpa, { replace: true });
    }
  }, [params, setParams, confirmar]);

  // A primeira leitura: com o grupo aberto, e depois da confirmação da volta
  // (se houver uma).
  useEffect(() => {
    if (!aberto) return undefined;
    let ativo = true;
    (async () => {
      if (confirmando.current) await confirmando.current;
      if (!ativo) return;
      const r = await ler();
      // Coleta andando quando a tela abriu: seguida calada, para a linha se
      // atualizar sozinha quando ela terminar.
      if (ativo && r) for (const f of r.lista) if (f.andando === true && !seguidas.current.has(f.fonte)) seguir(f.fonte, f.coletadoEm, false);
    })();
    return () => {
      ativo = false;
    };
  }, [aberto, ler, seguir]);

  // O foco da faixa: a linha da fonte aparece na tela depois que as linhas
  // existem (antes, a altura de cima ainda vai mudar). Chega depois da
  // leitura das fontes, e por isso vem depois da rolagem até o grupo que a
  // página de Configurações faz ao abrir (?secao=), e ganha dela. Pulo
  // direto ("instant"), e não a rolagem suave da página: quem chega de outra
  // tela quer ver a linha, e não a página correndo até ela.
  useEffect(() => {
    if (!foco || !retrato) return;
    setFoco(null);
    document.getElementById(`conexao-${foco}`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [foco, retrato]);

  // A contagem da trava no botão: um relógio por segundo, só enquanto há trava.
  useEffect(() => {
    const fim = Math.max(0, ...Object.values(travas));
    if (fim <= Date.now()) return undefined;
    const id = setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if (n >= fim) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [travas]);
  const travar = (fonte, segundos) => {
    const n = Date.now();
    setAgora(n);
    setTravas((t) => ({ ...t, [fonte]: n + segundos * 1000 }));
  };
  const restante = (fonte) => (travas[fonte] > agora ? Math.ceil((travas[fonte] - agora) / 1000) : 0);
  const marcar = (fonte, o) => setOcupado((x) => ({ ...x, [fonte]: o }));

  async function atualizar(f) {
    marcar(f.fonte, 'atualizar');
    avisar(f.fonte, null, null);
    try {
      // Pela memória única: a fonte pronta entra nela (e na faixa); a que
      // ficou andando no servidor fica marcada, e a memória relê até acabar.
      // Nunca lança: a recusa vem no resultado.
      const [r] = await atualizarFontes([f.fonte]);
      if (!vivo.current) return;
      if (!r?.ok) {
        if (r?.status === 429 && r.aguardarSegundos) travar(f.fonte, r.aguardarSegundos);
        avisar(f.fonte, r?.status === 429 ? 'aviso' : 'erro', r?.erro || 'Não foi possível pedir a coleta.');
        return;
      }
      // O servidor marcou a trava de 2 minutos desta fonte: o botão já conta.
      travar(f.fonte, TRAVA_COLETA_MS / 1000);
      if (r.andando) {
        seguir(f.fonte, f.coletadoEm, true);
        avisar(f.fonte, 'neutro', textoDaColetaAndando(rotuloDaFonte(f)));
      } else if (r.nova) {
        avisar(f.fonte, 'ok', textoDaColetaPronta(r.nova));
      } else {
        const lido = await ler();
        if (vivo.current) avisar(f.fonte, 'ok', textoDaColetaPronta(lido?.porFonte?.[f.fonte] || f));
      }
    } finally {
      if (vivo.current) marcar(f.fonte, null);
    }
  }

  async function conectar(f) {
    marcar(f.fonte, 'conectar');
    avisar(f.fonte, null, null);
    try {
      const { url, nonce } = await conectarInicioMarketing(f.fonte);
      // O nonce fica guardado NESTA aba antes de sair: a volta só é
      // confirmada se trouxer o mesmo. Sem conseguir guardar (armazenamento
      // da aba bloqueado), o provedor não abre: a volta não teria como ser
      // confirmada, e o Léo aceitaria a permissão à toa. A função antiga não
      // manda nonce (nem pede confirmação): aí só navega.
      if (nonce && !guardarNonce(f.fonte, nonce)) {
        avisar(
          f.fonte,
          'erro',
          'Este navegador não deixou guardar o pedido de conexão nesta aba (armazenamento bloqueado), e sem ele a volta não pode ser confirmada. Tente numa janela comum do navegador.'
        );
        marcar(f.fonte, null);
        return;
      }
      // Na mesma aba: o provedor devolve o Léo a esta tela, que confirma.
      // O botão fica ocupado até a página sair.
      window.location.assign(url);
    } catch (e) {
      if (!vivo.current) return;
      avisar(f.fonte, 'erro', e?.message || 'Não foi possível abrir a conexão.');
      marcar(f.fonte, null);
    }
  }

  async function desconectar(f) {
    if (!window.confirm(perguntaDeDesconectar(f.fonte))) return;
    marcar(f.fonte, 'desconectar');
    avisar(f.fonte, null, null);
    try {
      const r = await desconectarMarketing(f.fonte);
      if (!vivo.current) return;
      await ler();
      const a = avisoDoDesconectar(f.fonte, r);
      avisar(f.fonte, a.tom, a.texto);
    } catch (e) {
      if (vivo.current) avisar(f.fonte, 'erro', e?.message || 'Não foi possível desconectar.');
    } finally {
      if (vivo.current) marcar(f.fonte, null);
    }
  }

  function botao(f, k) {
    if (k === 'atualizar') atualizar(f);
    else if (k === 'conectar' || k === 'reconectar') conectar(f);
    else if (k === 'desconectar') desconectar(f);
  }
  const alternar = (fonte, qual) => setAbertos((a) => ({ ...a, [fonte]: { ...a[fonte], [qual]: !a[fonte]?.[qual] } }));

  const avisoVolta = avisoDaVolta(volta, retrato?.motivos);
  const papel = retrato?.papel || 'visualizacao';

  return (
    <div ref={raiz} className="mkt-conexoes">
      {avisoVolta && (
        <Aviso aviso={avisoVolta} onFechar={volta?.etapa === 'confirmando' ? null : () => setVolta(null)} className="mb-2">
          {avisoVolta.tentarDeNovo && (
            <>
              {' '}
              <button type="button" className="btn-outline alvo-40 ml-1 min-h-7 px-2 py-0.5 text-xs" onClick={() => confirmar(volta, true).then(() => ler())}>
                Tentar de novo
              </button>
            </>
          )}
        </Aviso>
      )}
      {retrato?.avisos?.length > 0 && <Aviso aviso={{ tom: 'aviso', texto: retrato.avisos.join(' ') }} className="mb-2" />}
      {erro && retrato && <Aviso aviso={{ tom: 'aviso', texto: `As fontes não atualizaram: ${erro} O que está abaixo é a última leitura.` }} className="mb-2" />}

      {!retrato && erro && (
        <div role="alert" className="mkt-conexao-aviso bg-bad-50 text-bad-700">
          <p className="min-w-0 flex-1">As conexões não carregaram: {erro}</p>
          <button type="button" className="btn-outline alvo-40 min-h-8 px-2.5 py-1 text-[13px]" onClick={() => ler()}>
            Tentar de novo
          </button>
        </div>
      )}
      {!retrato && !erro && (
        <div role="status" aria-label="Carregando as conexões" className="space-y-2">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-12" />
          ))}
        </div>
      )}

      {retrato && (
        <ul className="mkt-conexoes-lista">
          {retrato.lista.map((f) => {
            const linha = linhaDaConexao(f, papel, hoje);
            if (!linha) return null;
            return (
              <LinhaConexao
                key={f.fonte}
                linha={linha}
                ocupado={ocupado[f.fonte] || null}
                coletando={!!coletando[f.fonte]}
                restante={restante(f.fonte)}
                aviso={avisos[f.fonte] || null}
                aberto={abertos[f.fonte] || {}}
                onBotao={(k) => botao(f, k)}
                onAlternar={(qual) => alternar(f.fonte, qual)}
                onFecharAviso={() => avisar(f.fonte, null, null)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
