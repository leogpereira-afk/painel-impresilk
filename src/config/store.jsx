// Estado central do painel. Guarda a config (regras) e os overrides (marcacoes
// manuais: motivo, cobrado, motivo de perda, baixa). A fonte de verdade e o
// Netlify Blobs (compartilhado entre aparelhos); o localStorage e cache
// instantaneo no boot e fallback quando a rede falha. Qualquer mudanca aqui
// recalcula os modulos ao vivo (os modulos derivam tudo via useMemo).

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { CONFIG_PADRAO } from "./defaults.js";
import * as mubi from "../services/mubi.js";
import * as marcacoes from "../services/marcacoes.js";
import { getSessao, aoMudarSessao } from "../lib/sessao.js";

const K_CONFIG = "painel_config";
const K_OV_REC = "painel_ov_rec";
const K_OV_ORC = "painel_ov_orc";

const AppContext = createContext(null);

function ler(chave, fallback) {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function mesclarConfig(salvo) {
  if (!salvo) return structuredClone(CONFIG_PADRAO);
  return {
    ...structuredClone(CONFIG_PADRAO),
    ...salvo,
    parametros: { ...CONFIG_PADRAO.parametros, ...(salvo.parametros || {}) },
  };
}

export function AppProvider({ children }) {
  const [config, setConfig] = useState(() => mesclarConfig(ler(K_CONFIG, null)));
  const [overridesRecebiveis, setOvRec] = useState(() => ler(K_OV_REC, null));
  const [overridesOrcamentos, setOvOrc] = useState(() => ler(K_OV_ORC, null));

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

  const recarregar = useCallback(async () => {
    if (!getSessao()) return; // sem cracha nao adianta tentar
    const minhaGeracao = ++geracaoRef.current;
    const atual = () => geracaoRef.current === minhaGeracao;
    setCarregando(true);
    setErro(null);
    // O carimbo de frescor e o MAIS VELHO das fontes desta carga. Sem zerar,
    // ele guardaria para sempre o mais velho ja visto e o painel ficaria
    // vermelho para sempre depois de um unico soluco.
    mubi.zerarFrescor();

    const semPermissao = (e) => /nao tem acesso|403/i.test(e?.message || "");
    const buscar = async (fn) => {
      try {
        return { ok: true, valor: await fn() };
      } catch (e) {
        return { ok: false, erro: e, permissao: semPermissao(e) };
      }
    };

    try {
      const [rRec, rPag, rBan, rOrc, rOrd] = await Promise.all([
        buscar(mubi.getRecebiveis),
        buscar(mubi.getPagar),
        buscar(mubi.getContasBancarias),
        buscar(mubi.getOrcamentos),
        buscar(mubi.getOrdensServico),
      ]);
      const todas = [rRec, rPag, rBan, rOrc, rOrd];
      const falhasReais = todas.filter((r) => !r.ok && !r.permissao);
      // Nenhuma respondeu e nao foi permissao: aí sim e erro de verdade.
      if (todas.every((r) => !r.ok) && falhasReais.length) {
        throw falhasReais[0].erro;
      }

      if (!atual()) return; // outra carga (outra sessão) já começou

      const nomes = ["recebiveis", "pagar", "bancos", "orcamentos", "ordens"];
      const negadas = [];
      const falharam = [];
      todas.forEach((r, i) => {
        if (r.permissao) negadas.push(nomes[i]);
        else if (!r.ok) falharam.push(nomes[i]);
      });
      setFontesNegadas(negadas);
      setFontesQueFalharam(falharam);

      const ordens = rOrd.valor || [];
      setDados({
        recebiveis: rRec.valor || [],
        pagar: rPag.valor || [],
        bancos: rBan.valor || [],
        orcamentos: rOrc.valor || [],
        ordens,
        catalogo: mubi.getProdutosCatalogo(ordens),
        dsoHist: mubi.getDsoHistorico(),
      });
      /* `atualizadoEm` (o mais velho da carga) alimenta o chip GLOBAL do
         cabecalho. `frescorDe` deixa cada tela perguntar pela fonte que ELA
         usa: colapsar tudo num minimo unico faria Contas Atrasadas carimbar
         "de ontem" porque `pagar` -- que ela nem le -- atrasou. */
      setAtualizadoEm(mubi.getUltimaAtualizacao());
      setFrescorDe(() => mubi.getUltimaAtualizacao);
      // Semeia overrides na primeira carga (para o app ja nascer classificado).
      setOvRec((prev) => prev ?? mubi.getSeedOverridesRecebiveis());
      setOvOrc((prev) => prev ?? mubi.getSeedOverridesOrcamentos());
    } catch (e) {
      if (atual()) setErro(e.message || "Falha ao carregar dados");
    } finally {
      if (atual()) setCarregando(false);
    }
  }, []);

  // Carrega ao entrar -- e RECARREGA quando a sessao muda. Sem isto, o provider
  // (que monta por cima da tela de login) buscava tudo sem cracha, tomava 401 e
  // deixava o erro gravado: a pessoa logava e continuava vendo "Entre no
  // sistema" ate apertar F5.
  useEffect(() => {
    recarregar();
    return aoMudarSessao(() => {
      /* SAIR TEM DE LIMPAR. O provider não desmonta ao trocar de sessão: sem
         isto, o painel da pessoa anterior ficava na tela inteirinho até a
         carga nova terminar -- e se ela não tivesse permissão para alguma
         fonte, ficava para sempre. */
      geracaoRef.current += 1;
      setDados(null);   // volta ao estado de "ainda não carregou"
      setFontesNegadas([]);
      setFontesQueFalharam([]);
      setErro(null);
      recarregar();
    });
  }, [recarregar]);

  // Boot: puxa as marcacoes do Blobs (fonte de verdade, compartilhada entre
  // aparelhos). O estado inicial ja veio do localStorage, entao a tela nao
  // pisca; se a rede falhar, segue com o local mesmo.
  // Roda no boot E a cada troca de sessao. Sem o segundo caso havia risco de
  // PERDA DE DADOS: quem entrava nunca baixava as regras da nuvem (a chamada do
  // boot morria com 401, sem cracha), ficava com o CONFIG_PADRAO em memoria e,
  // ao mexer em qualquer ajuste, gravava esse padrao por cima do que estava no
  // Blobs -- apagando as regras de todo mundo.
  const [marcacoesProntas, setMarcacoesProntas] = useState(false);
  useEffect(() => {
    let vivo = true;
    const puxar = () => {
      if (!getSessao()) return;
      marcacoes
        .carregarMarcacoes()
        .then((remoto) => {
          if (!vivo || !remoto) return;
          if (remoto.config) setConfig(mesclarConfig(remoto.config));
          if (remoto.overridesRecebiveis) setOvRec(remoto.overridesRecebiveis);
          if (remoto.overridesOrcamentos) setOvOrc(remoto.overridesOrcamentos);
          setMarcacoesProntas(true);
        })
        .catch((e) => console.warn("marcacoes: sem nuvem, usando local:", e?.message || e));
    };
    puxar();
    const parar = aoMudarSessao(puxar);
    return () => {
      vivo = false;
      parar();
    };
  }, []);

  // Cache local (espelho para boot instantaneo e fallback offline).
  useEffect(() => {
    localStorage.setItem(K_CONFIG, JSON.stringify(config));
  }, [config]);
  useEffect(() => {
    if (overridesRecebiveis) localStorage.setItem(K_OV_REC, JSON.stringify(overridesRecebiveis));
  }, [overridesRecebiveis]);
  useEffect(() => {
    if (overridesOrcamentos) localStorage.setItem(K_OV_ORC, JSON.stringify(overridesOrcamentos));
  }, [overridesOrcamentos]);

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
  const updateConfig = useCallback(
    (fn) => {
      setConfig((c) => {
        const novo = fn(structuredClone(c));
        // Nao grava na nuvem antes de ter LIDO a nuvem: senao a config local
        // (que pode ser so o padrao) sobe por cima das regras reais de todo
        // mundo. A tela ja mostra a mudanca; a nuvem espera a leitura chegar.
        if (marcacoesProntas) {
          marcacoes
            .salvarConfig(novo)
            .catch(aoFalhar("config"));
        } else {
          console.warn("config: alteracao so local -- as regras da nuvem ainda nao chegaram");
        }
        return novo;
      });
    },
    [marcacoesProntas, aoFalhar]
  );
  const resetarConfig = useCallback(() => {
    const padrao = structuredClone(CONFIG_PADRAO);
    setConfig(padrao);
    marcacoes.salvarConfig(padrao).catch(aoFalhar("config"));
  }, [aoFalhar]);

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
  const setOverridesOrcamento = useCallback((patch) => {
    setOvOrc((prev) => {
      const novo = { ...(prev || {}) };
      for (const [id, campos] of Object.entries(patch)) {
        novo[id] = { ...(novo[id] || {}), ...campos };
      }
      return novo;
    });
    return marcacoes
      .mesclarOverridesOrcamento(patch)
      .catch(aoFalhar("ov_orc"));
  }, [aoFalhar]);

  const valor = useMemo(
    () => ({
      config,
      setConfig,
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
