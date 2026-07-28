// Estado central do painel. Guarda a config (regras) e os overrides (marcacoes
// manuais: motivo, cobrado, motivo de perda, baixa). A fonte de verdade e o
// Netlify Blobs (compartilhado entre aparelhos); o localStorage e cache
// instantaneo no boot e fallback quando a rede falha. Qualquer mudanca aqui
// recalcula os modulos ao vivo (os modulos derivam tudo via useMemo).

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
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
  const recarregar = useCallback(async () => {
    if (!getSessao()) return; // sem cracha nao adianta tentar
    setCarregando(true);
    setErro(null);

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
      setAtualizadoEm(mubi.getUltimaAtualizacao());
      // Semeia overrides na primeira carga (para o app ja nascer classificado).
      setOvRec((prev) => prev ?? mubi.getSeedOverridesRecebiveis());
      setOvOrc((prev) => prev ?? mubi.getSeedOverridesOrcamentos());
    } catch (e) {
      setErro(e.message || "Falha ao carregar dados");
    } finally {
      setCarregando(false);
    }
  }, []);

  // Carrega ao entrar -- e RECARREGA quando a sessao muda. Sem isto, o provider
  // (que monta por cima da tela de login) buscava tudo sem cracha, tomava 401 e
  // deixava o erro gravado: a pessoa logava e continuava vendo "Entre no
  // sistema" ate apertar F5.
  useEffect(() => {
    recarregar();
    return aoMudarSessao(() => recarregar());
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
  // o Blobs em segundo plano; erro de rede so vira aviso, nunca perde o clique.
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
            .catch((e) => console.warn("config: sync falhou:", e?.message || e));
        } else {
          console.warn("config: alteracao so local -- as regras da nuvem ainda nao chegaram");
        }
        return novo;
      });
    },
    [marcacoesProntas]
  );
  const resetarConfig = useCallback(() => {
    const padrao = structuredClone(CONFIG_PADRAO);
    setConfig(padrao);
    marcacoes.salvarConfig(padrao).catch((e) => console.warn("config: sync falhou:", e?.message || e));
  }, []);

  const setOverrideRecebivel = useCallback((id, patch) => {
    setOvRec((prev) => ({ ...(prev || {}), [id]: { ...(prev?.[id] || {}), ...patch } }));
    marcacoes
      .mesclarOverrideRecebivel(id, patch)
      .catch((e) => console.warn("ov_rec: sync falhou:", e?.message || e));
  }, []);
  const setOverrideOrcamento = useCallback((id, patch) => {
    setOvOrc((prev) => ({ ...(prev || {}), [id]: { ...(prev?.[id] || {}), ...patch } }));
    marcacoes
      .mesclarOverrideOrcamento(id, patch)
      .catch((e) => console.warn("ov_orc: sync falhou:", e?.message || e));
  }, []);
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
      .catch((e) => console.warn("ov_orc: sync falhou:", e?.message || e));
  }, []);

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
      atualizadoEm,
      pronto: !!dados && !carregando,
      carregando,
      erro,
      recarregar,
      modoDemo: mubi.MODO_DEMO,
    }),
    [
      config,
      updateConfig,
      resetarConfig,
      overridesRecebiveis,
      overridesOrcamentos,
      setOverrideRecebivel,
      setOverrideOrcamento,
      setOverridesOrcamento,
      dados,
      atualizadoEm,
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
