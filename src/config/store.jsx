import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {useLocation} from "react-router-dom";
import {fontesDaRota} from "../lib/fontes-por-rota.js";
import { CONFIG_PADRAO } from "./defaults.js";
import * as mubi from "../services/mubi.js";
import * as marcacoes from "../services/marcacoes.js";
import { getSessao, aoMudarSessao } from "../lib/sessao.js";

import { criarSincronizacao } from "../lib/config-sincronizacao.js";

const K_CONFIG = "painel_config";
const K_OV_REC = "painel_ov_rec";
const K_OV_ORC = "painel_ov_orc";

const AppContext = createContext(null);

function mesclarConfig(salvo) {
  if (!salvo) return structuredClone(CONFIG_PADRAO);
  return {
    ...structuredClone(CONFIG_PADRAO),
    ...salvo,
    parametros: { ...CONFIG_PADRAO.parametros, ...(salvo.parametros || {}) },
  };
}

export function AppProvider({ children }) {
  const {pathname} = useLocation();
  const fontes = fontesDaRota(pathname);
  const cacheFontes = useRef(new Map());
  const [config, setConfig] = useState(() => mesclarConfig(null));
  const [overridesRecebiveis, setOvRec] = useState(null);
  const [overridesOrcamentos, setOvOrc] = useState(null);

  const [dados, setDados] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  // Funcao, nao objeto: guardada em estado para a troca de carga disparar novo
  // render. `() => fn` porque useState trata funcao como inicializador.
  const [frescorDe, setFrescorDe] = useState(() => () => null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // Carrega os dados do Mubi (demo ou Functions). O filtro por data de corte
  // acontece no front (calc), entao nao precisa reconsultar ao mudar o corte.
  // Carrega cada fonte de forma INDEPENDENTE.
  //
  // Antes era um Promise.all: bastava UM 403 para derrubar o painel inteiro.
  // Como cada function agora exige a permissao do seu modulo, quem tivesse
  // acesso a so um modulo levava erro em TODAS as telas -- inclusive na que
  // podia ver. A permissao por pessoa nao funcionava na pratica por causa disto.
  //
  // Agora: quem nao tem permissao recebe lista vazia naquela fonte e o resto da
  // tela funciona. So vira erro de verdade se NENHUMA fonte responder (aí e
  // problema de rede/sessao, nao de permissao).
  // Fonte NEGADA por permissao nao e fonte vazia. A diferenca importa: sem
  // recebiveis, o Fluxo projetaria 30 dias sem UMA entrada e mostraria um
  // caixa catastrofico como se fosse verdade; sem as O.S., Contas Atrasadas
  // ficaria com todos os titulos sem vendedor. A tela precisa saber e avisar.
  const [fontesNegadas, setFontesNegadas] = useState([]);
  /* FONTE QUE FALHOU não é fonte vazia -- e nem sempre é permissão. Um 503
     ("cache ainda não aquecido") ou uma queda de rede numa fonte só passava
     como lista vazia: Contas Atrasadas dizia "nada atrasado" e o chip de
     frescor ficava verde por cima. Permissão a pessoa entende; falha ela
     precisa saber para não decidir com meia base. */
  const [fontesQueFalharam, setFontesQueFalharam] = useState([]);
  /* A GERAÇÃO DA CARGA. Sem ela, a resposta lenta da sessão ANTERIOR
     aterrissava por cima da carga da sessão nova -- no computador da recepção
     isso é o dado de uma pessoa aparecendo para outra. */
  const geracaoRef = useRef(0);

  const recarregar = useCallback(async (forcar = true) => {
    if (!getSessao()) return; // sem cracha nao adianta tentar
    const minhaGeracao = ++geracaoRef.current;
    const atual = () => geracaoRef.current === minhaGeracao;
    setCarregando(true);
    setErro(null);
    // O carimbo de frescor e o MAIS VELHO das fontes desta carga. Sem zerar,
    // ele guardaria para sempre o mais velho ja visto e o painel ficaria
    // vermelho para sempre depois de um unico soluco.


    const semPermissao = (e) => /nao tem acesso|403/i.test(e?.message || "");
    const buscar = async (fn) => {
      try {
        return { ok: true, valor: await fn() };
      } catch (e) {
        return { ok: false, erro: e, permissao: semPermissao(e) };
      }
    };

    try {
      const carregar = {recebiveis:mubi.getRecebiveis, ordens:mubi.getOrdensServico, orcamentos:mubi.getOrcamentos};
      const nomesMubi = {recebiveis:'contas-atrasadas',ordens:'produtos',orcamentos:'orcamentos'};
      const todas = await Promise.all(fontes.map(async nome => {
        const guardado = cacheFontes.current.get(nome);
        if(!forcar && guardado && Date.now()-guardado.lidoEm < 300000) return guardado;
        const resultado = await buscar(carregar[nome]);
        resultado.lidoEm = Date.now();
        resultado.atualizadoEm = mubi.getUltimaAtualizacao(nomesMubi[nome]);
        if(atual() && resultado.ok) cacheFontes.current.set(nome,resultado);
        return resultado;
      }));
      const falhasReais = todas.filter((r) => !r.ok && !r.permissao);
      // Nenhuma respondeu e nao foi permissao: aí sim e erro de verdade.
      if (todas.every((r) => !r.ok) && falhasReais.length) {
        throw falhasReais[0].erro;
      }

      if (!atual()) return; // outra carga (outra sessão) já começou

      const nomes = fontes;
      const negadas = [];
      const falharam = [];
      todas.forEach((r, i) => {
        if (r.permissao) negadas.push(nomes[i]);
        else if (!r.ok) falharam.push(nomes[i]);
      });
      setFontesNegadas(negadas);
      setFontesQueFalharam(falharam);

      const valores = {recebiveis:[],pagar:[],bancos:[],orcamentos:[],ordens:[]};
      todas.forEach((r,i)=>{valores[fontes[i]]=r.valor || [];});
      setDados({...valores,catalogo:mubi.getProdutosCatalogo(valores.ordens),dsoHist:mubi.getDsoHistorico()});
      const carimbos = todas.map(r=>r.atualizadoEm).filter(Boolean).sort();
      const minimo = carimbos[0] || null;
      setAtualizadoEm(minimo);
      const porFonte = Object.fromEntries(todas.map((r,i)=>[nomesMubi[fontes[i]],r.atualizadoEm]));
      setFrescorDe(()=>nome=>porFonte[nome] || minimo);
      // Semeia overrides na primeira carga (para o app ja nascer classificado).
      setOvRec((prev) => prev ?? mubi.getSeedOverridesRecebiveis());
      setOvOrc((prev) => prev ?? mubi.getSeedOverridesOrcamentos());
    } catch (e) {
      if (atual()) setErro(e.message || "Falha ao carregar dados");
    } finally {
      if (atual()) setCarregando(false);
    }
  }, [fontes]);

  // Carrega ao entrar -- e RECARREGA quando a sessao muda. Sem isto, o provider
  // (que monta por cima da tela de login) buscava tudo sem cracha, tomava 401 e
  // deixava o erro gravado: a pessoa logava e continuava vendo "Entre no
  // sistema" ate apertar F5.
  useEffect(() => {
    recarregar(false);
    return aoMudarSessao(() => {
      /* SAIR TEM DE LIMPAR. O provider não desmonta ao trocar de sessão: sem
         isto, o painel da pessoa anterior ficava na tela inteirinho até a
         carga nova terminar -- e se ela não tivesse permissão para alguma
         fonte, ficava para sempre. */
      geracaoRef.current += 1;
      cacheFontes.current.clear();
      mubi.zerarFrescor();
      setDados(null);   // volta ao estado de "ainda não carregou"
      setFontesNegadas([]);
      setFontesQueFalharam([]);
      setErro(null);
      recarregar();
    });
  }, [recarregar]);

  const [marcacoesProntas, setMarcacoesProntas] = useState(false);
  const [erroMarcacoes, setErroMarcacoes] = useState('');
  const [syncConfig, setSyncConfig] = useState({status:'carregando',erro:''});
  const [tentativaMarcacoes, setTentativaMarcacoes] = useState(0);
  const sincronizador = useRef(null);
  if (!sincronizador.current) sincronizador.current = criarSincronizacao({
    salvar: marcacoes.salvarConfig,
    normalizar: mesclarConfig,
    aoMudar: (estado) => { setSyncConfig(estado); if (estado.config) setConfig(estado.config); },
  });
  useEffect(() => {
    let geracao = 0;
    const puxar = () => {
      const atual = ++geracao;
      sincronizador.current.limpar();
      setMarcacoesProntas(false); setErroMarcacoes(''); setFalhaSync(null);
      setConfig(mesclarConfig(null)); setOvRec(null); setOvOrc(null);
      try { for (const chave of [K_CONFIG, K_OV_REC, K_OV_ORC]) localStorage.removeItem(chave); } catch { /* Cache antigo indisponível neste navegador. */ }
      if (!getSessao()) return;
      marcacoes.carregarMarcacoes().then(remoto => {
        if (atual !== geracao || !getSessao()) return;
        sincronizador.current.carregar(mesclarConfig(remoto.config), remoto.config || {});
        setOvRec(remoto.overridesRecebiveis || {}); setOvOrc(remoto.overridesOrcamentos || {});
        setMarcacoesProntas(true);
      }).catch(e => { if (atual === geracao) setErroMarcacoes(e.message || 'Não foi possível carregar as configurações.'); });
    };
    puxar(); const parar = aoMudarSessao(puxar);
    return () => { geracao++; sincronizador.current.limpar(); parar(); };
  }, [tentativaMarcacoes]);
  useEffect(() => {
    if (syncConfig.status !== 'pendente') return;
    const timer = setTimeout(() => sincronizador.current.salvar(), 500);
    return () => clearTimeout(timer);
  }, [syncConfig]);
  useEffect(() => {
    if (!['pendente','salvando','erro'].includes(syncConfig.status)) return;
    const avisar = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [syncConfig.status]);
  const recarregarMarcacoes = useCallback(() => setTentativaMarcacoes(n => n + 1), []);
  const tentarSalvarConfig = useCallback(() => sincronizador.current.salvar(), []);

  // Mutadores. Cada um atualiza o estado na hora (UI otimista) e sincroniza com
  // o servidor em segundo plano; erro de rede nunca perde o clique.
  //
  // MAS NAO PODE FICAR SO NO CONSOLE. Ate 04/08/2026 a falha de sincronizacao
  // ia para console.warn: a tela dizia "salvo", a nuvem nunca recebia, e a
  // pessoa so descobria no dia seguinte, ao ver o painel de outro computador
  // sem a alteracao. Agora a falha vira um aviso na tela (ver Layout).
  const [falhaSync, setFalhaSync] = useState(null);
  const aoFalhar = useCallback(
    (oque) => (e) => {
      console.warn(`${oque}: sync falhou:`, e?.message || e);
      setFalhaSync({
        oque,
        texto:
          "A alteracao aparece aqui, mas NAO chegou ao servidor. " +
          "Confira a internet e refaca; em outro computador ela ainda nao existe.",
      });
    },
    []
  );
  const updateConfig = useCallback(fn => {
    try { sincronizador.current.alterar(fn); }
    catch(e) { setErroMarcacoes(e.message); }
  }, []);
  const resetarConfig = useCallback(() => updateConfig(() => structuredClone(CONFIG_PADRAO)), [updateConfig]);

  const setOverrideRecebivel = useCallback((id, patch) => {
    setOvRec((prev) => ({ ...(prev || {}), [id]: { ...(prev?.[id] || {}), ...patch } }));
    marcacoes
      .mesclarOverrideRecebivel(id, patch)
      .catch(aoFalhar("ov_rec"));
  }, [aoFalhar]);
  const setOverrideOrcamento = useCallback((id, patch) => {
    setOvOrc((prev) => ({ ...(prev || {}), [id]: { ...(prev?.[id] || {}), ...patch } }));
    marcacoes
      .mesclarOverrideOrcamento(id, patch)
      .catch(aoFalhar("ov_orc"));
  }, [aoFalhar]);
  // Varios orcamentos numa tacada (ex: agendar o retorno de um cliente que tem
  // quatro orcamentos abertos). Um pedido so -- ver marcacoes.js para o porque.
  const setOverridesOrcamento = useCallback(async (patch) => {
    // Só exibe o novo estado depois da confirmação; a página trata o erro.
    await marcacoes.mesclarOverridesOrcamento(patch);
    setOvOrc((prev) => {
      const novo = { ...(prev || {}) };
      for (const [id, campos] of Object.entries(patch)) {
        novo[id] = { ...(novo[id] || {}), ...campos };
      }
      return novo;
    });
  }, []);

  const valor = useMemo(
    () => ({
      config,
      marcacoesProntas, erroMarcacoes, recarregarMarcacoes, syncConfig, tentarSalvarConfig,
      updateConfig,
      resetarConfig,
      overridesRecebiveis: overridesRecebiveis || {},
      overridesOrcamentos: overridesOrcamentos || {},
      setOverrideRecebivel,
      setOverrideOrcamento,
      setOverridesOrcamento,
      dados,
      fontesNegadas,
      fontesQueFalharam,
      falhaSync,
      limparFalhaSync: () => setFalhaSync(null),
      atualizadoEm,
      frescorDe,
      pronto: !!dados && !carregando,
      carregando,
      erro,
      recarregar,
      modoDemo: mubi.MODO_DEMO,
    }),
    [
      config,
      marcacoesProntas, erroMarcacoes, recarregarMarcacoes, syncConfig, tentarSalvarConfig,
      fontesNegadas,
      fontesQueFalharam,
      falhaSync,
      updateConfig,
      resetarConfig,
      overridesRecebiveis,
      overridesOrcamentos,
      setOverrideRecebivel,
      setOverrideOrcamento,
      setOverridesOrcamento,
      dados,
      atualizadoEm,
      frescorDe,
      carregando,
      erro,
      recarregar,
    ]
  );

  return <AppContext.Provider value={valor}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp precisa estar dentro de AppProvider");
  return ctx;
}
