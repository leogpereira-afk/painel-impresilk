/* A SUB-ABA "DADOS" DO CANAL ABERTO (?v=<canal>&sub=dados): os números que
 * as integrações trazem sozinhas, só nos canais com fonte (site, facebook,
 * instagram, google, linkedin, pinterest).
 *
 * De cima para baixo:
 *  - a barra: o estado do canal (juntando as fontes dele), de onde vêm os
 *    números e o "Atualizar agora" (só gestão e marketing, e só das fontes
 *    que dá para coletar: configuradas e, nas por OAuth, conectadas);
 *  - os avisos da última coleta, quando há (as frases do servidor);
 *  - um ou mais quadros por fonte, na ordem da aba (o canal site abre com o
 *    tráfego: Google Analytics, Search Console, Google Ads; depois o que o
 *    conector do site lê de fora).
 *
 * A ação "fontes" vem da memória única (useFontesMarketing.js), e esta
 * sub-aba pede os dados SÓ das fontes do canal aberto (fontesQueAlimentam:
 * o Facebook lê só a Meta; o Site, site, google e google_ads). Trocar de
 * sub-aba, ou voltar a um canal já lido, não pede de novo; trocar de canal
 * pede só as fontes que faltam. Leitura que falhou com um retrato já na tela
 * avisa e mantém o retrato.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Selo } from '../../lista.jsx';
import { Skeleton } from '../../ui.jsx';
import { useMarketing } from '../contexto.js';
import { Bloco as Cartao } from '../Bloco.jsx';
import { ROTULO_FONTE, acoesDaFonte, estadoDoCanal, fontesQueAlimentam, rotuloDaLigacao } from '../../../lib/calc/marketing-fontes.js';
import { motivosDasLigacoes, quadroDeAvisos } from '../../../lib/calc/marketing-dados.js';
import { chaveDaLigacao, ligacoesNaAba, quadrosDaLigacao } from '../../../lib/calc/marketing-dados-canal.js';
import { atualizarFontes, useFontesMarketing } from './useFontesMarketing.js';
import QuadroDados, { ListaDeQuadros } from './QuadroDados.jsx';
import DadosSite from './DadosSite.jsx';
import DadosGoogle from './DadosGoogle.jsx';
import DadosGoogleAds from './DadosGoogleAds.jsx';
import DadosMeta from './DadosMeta.jsx';
import DadosLinkedin from './DadosLinkedin.jsx';
import DadosPinterest from './DadosPinterest.jsx';
import './dados.css';

const POR_FONTE = { site: DadosSite, google: DadosGoogle, google_ads: DadosGoogleAds, meta: DadosMeta, linkedin: DadosLinkedin, pinterest: DadosPinterest };

/* Fonte nova, sem componente: os quadros genéricos (o estado e a frase de
   que esta tela ainda não a desenha), nunca sumida. */
function DadosGenericos({ ligacao, hoje }) {
  const quadros = useMemo(() => quadrosDaLigacao(ligacao, { hoje }), [ligacao, hoje]);
  return <ListaDeQuadros quadros={quadros} />;
}

/** "A, B e C". */
function emLista(nomes) {
  const l = [...new Set(nomes.filter(Boolean))];
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

function BarraDosDados({ canal, ligacoes, retrato }) {
  const { papel, avisar } = useMarketing();
  const [atualizando, setAtualizando] = useState(false);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  const fontes = [...new Set(ligacoes.map((l) => l.fonte))];
  const estado = estadoDoCanal(canal.codigo, retrato.porFonte);
  const andando = fontes.filter((f) => retrato.porFonte[f]?.andando === true);
  // A tela só esconde o botão; quem recusa de verdade é o servidor (403).
  const atualizaveis = fontes.filter((f) => acoesDaFonte(retrato.porFonte[f], papel).atualizar);
  const nome = (f) => ROTULO_FONTE[f] ?? f;

  async function atualizar() {
    setAtualizando(true);
    const r = await atualizarFontes(atualizaveis);
    if (!vivo.current) return;
    setAtualizando(false);
    const erros = r.filter((x) => !x.ok);
    const andandoAinda = r.filter((x) => x.ok && x.andando);
    const prontas = r.filter((x) => x.ok && !x.andando);
    if (erros.length) {
      avisar(erros.map((x) => `${nome(x.fonte)}: ${x.erro}`).join(' '), 'erro');
      return;
    }
    if (andandoAinda.length) avisar(`A coleta de ${emLista(andandoAinda.map((x) => nome(x.fonte)))} continua no servidor. Os números entram aqui sozinhos em instantes.`);
    else if (prontas.length) avisar(`Dados atualizados: ${emLista(prontas.map((x) => nome(x.fonte)))}.`);
  }

  return (
    <div className="mkt-dados-barra">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {estado && <Selo tom={estado.tom}>{estado.rotulo}</Selo>}
        <p className="min-w-0 text-[13px] text-slate-600">
          De {emLista(ligacoes.map(rotuloDaLigacao))}.<span className="hidden sm:inline"> A coleta roda sozinha todo dia de manhã.</span>
        </p>
        {andando.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700" role="status">
            <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
            Coletando {emLista(andando.map(nome))}...
          </span>
        )}
      </div>
      {atualizaveis.length > 0 && (
        <button type="button" className="btn-outline alvo-40 min-h-9 shrink-0 px-3 py-1.5" onClick={atualizar} disabled={atualizando || andando.length > 0}>
          <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" className={atualizando ? 'animate-spin' : undefined} />
          {atualizando ? 'Atualizando...' : 'Atualizar agora'}
        </button>
      )}
    </div>
  );
}

export default function SubDados({ canal }) {
  const { hoje } = useMarketing();
  const { retrato, erro, carregando, recarregar } = useFontesMarketing({ fontes: fontesQueAlimentam(canal.codigo) });
  const ligacoes = useMemo(() => (retrato ? ligacoesNaAba(canal.codigo, retrato.porFonte) : []), [retrato, canal.codigo]);
  const avisos = useMemo(
    () => (retrato ? quadroDeAvisos(ligacoes, retrato.porFonte, { avisosGerais: retrato.avisos, jaDitos: motivosDasLigacoes(ligacoes), hoje }) : null),
    [retrato, ligacoes, hoje]
  );

  if (!retrato) {
    if (erro && !carregando) {
      return (
        <Cartao role="alert">
          <p className="text-sm text-slate-700">
            <strong className="text-bad-700">Não foi possível ler os dados das integrações.</strong> {erro}
          </p>
          <button type="button" className="btn-outline alvo-40 mt-2 min-h-9 px-3 py-1.5" onClick={recarregar}>
            Tentar de novo
          </button>
        </Cartao>
      );
    }
    return (
      <div className="space-y-2" role="status" aria-label="Carregando os dados das integrações">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="mkt-dados">
      <BarraDosDados canal={canal} ligacoes={ligacoes} retrato={retrato} />
      {erro && (
        <div role="alert" className="mkt-dados-estado border-warn-200 bg-warn-50 text-warn-800">
          <p className="min-w-0 flex-1">
            <strong>Não foi possível atualizar.</strong> {erro} A última leitura continua na tela.
          </p>
          <button type="button" className="btn-outline alvo-40 min-h-8 shrink-0 px-2.5 py-1 text-[13px]" onClick={recarregar}>
            Tentar de novo
          </button>
        </div>
      )}
      {avisos && <QuadroDados quadro={avisos} />}
      {ligacoes.map((l) => {
        const Componente = POR_FONTE[l.fonte] ?? DadosGenericos;
        return <Componente key={chaveDaLigacao(l)} ligacao={l} hoje={hoje} />;
      })}
    </div>
  );
}
