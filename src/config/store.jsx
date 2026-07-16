// Estado central do painel. Guarda a config (regras) e os overrides (marcacoes
// manuais: motivo, cobrado, motivo de perda, baixa). A fonte de verdade e o
// Netlify Blobs (compartilhado entre aparelhos); o localStorage e cache
// instantaneo no boot e fallback quando a rede falha. Qualquer mudanca aqui
// recalcula os modulos ao vivo (os modulos derivam tudo via useMemo).

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { CONFIG_PADRAO } from "./defaults.js";
import * as mubi from "../services/mubi.js";
import * as marcacoes from "../services/marcacoes.js";

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
  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [recebiveis, pagar, bancos, orcamentos, ordens] = await Promise.all([
        mubi.getRecebiveis(),
        mubi.getPagar(),
        mubi.getContasBancarias(),
        mubi.getOrcamentos(),
        mubi.getOrdensServico(),
      ]);
      setDados({
        recebiveis,
        pagar,
        bancos,
        orcamentos,
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

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Boot: puxa as marcacoes do Blobs (fonte de verdade, compartilhada entre
  // aparelhos). O estado inicial ja veio do localStorage, entao a tela nao
  // pisca; se a rede falhar, segue com o local mesmo.
  useEffect(() => {
    let vivo = true;
    marcacoes
      .carregarMarcacoes()
      .then((remoto) => {
        if (!vivo || !remoto) return;
        if (remoto.config) setConfig(mesclarConfig(remoto.config));
        if (remoto.overridesRecebiveis) setOvRec(remoto.overridesRecebiveis);
        if (remoto.overridesOrcamentos) setOvOrc(remoto.overridesOrcamentos);
      })
      .catch((e) => console.warn("marcacoes: boot sem nuvem, usando local:", e?.message || e));
    return () => {
      vivo = false;
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
  const updateConfig = useCallback((fn) => {
    setConfig((c) => {
      const novo = fn(structuredClone(c));
      marcacoes.salvarConfig(novo).catch((e) => console.warn("config: sync falhou:", e?.message || e));
      return novo;
    });
  }, []);
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
