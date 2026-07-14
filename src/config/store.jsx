// Estado central do painel. Guarda a config (regras) e os overrides (marcacoes
// manuais: motivo, cobrado, motivo de perda). Persiste no localStorage agora e
// esta pronto para sincronizar no Netlify Blobs. Qualquer mudanca aqui recalcula
// os modulos ao vivo (os modulos derivam tudo via useMemo).

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { CONFIG_PADRAO } from "./defaults.js";
import * as mubi from "../services/mubi.js";

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

  // Ref da config para o carregamento ler o valor atual sem recarregar a cada edicao.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // Carrega os dados do Mubi (demo ou Functions) uma vez.
  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const desde = configRef.current?.parametros?.dataCorteOrcamentos;
      const [recebiveis, pagar, bancos, orcamentos, ordens] = await Promise.all([
        mubi.getRecebiveis(),
        mubi.getPagar(),
        mubi.getContasBancarias(),
        mubi.getOrcamentos(desde),
        mubi.getOrdensServico(desde),
      ]);
      setDados({
        recebiveis,
        pagar,
        bancos,
        orcamentos,
        ordens,
        catalogo: mubi.getProdutosCatalogo(ordens),
      });
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

  // Persistencia.
  useEffect(() => {
    localStorage.setItem(K_CONFIG, JSON.stringify(config));
  }, [config]);
  useEffect(() => {
    if (overridesRecebiveis) localStorage.setItem(K_OV_REC, JSON.stringify(overridesRecebiveis));
  }, [overridesRecebiveis]);
  useEffect(() => {
    if (overridesOrcamentos) localStorage.setItem(K_OV_ORC, JSON.stringify(overridesOrcamentos));
  }, [overridesOrcamentos]);

  // Mutadores.
  const updateConfig = useCallback((fn) => setConfig((c) => fn(structuredClone(c))), []);
  const resetarConfig = useCallback(() => setConfig(structuredClone(CONFIG_PADRAO)), []);

  const setOverrideRecebivel = useCallback((id, patch) => {
    setOvRec((prev) => ({ ...(prev || {}), [id]: { ...(prev?.[id] || {}), ...patch } }));
  }, []);
  const setOverrideOrcamento = useCallback((id, patch) => {
    setOvOrc((prev) => ({ ...(prev || {}), [id]: { ...(prev?.[id] || {}), ...patch } }));
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
