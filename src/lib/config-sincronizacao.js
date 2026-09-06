// Sincronização por sessão: não apresenta uma edição local como gravação feita.
const copiar = (v) => structuredClone(v);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function diferencaConfig(antes, depois) {
  const patch = {};
  for (const chave of new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})])) {
    if (chave === 'parametros') {
      const campos = {};
      for (const k of new Set([...Object.keys(antes?.parametros || {}), ...Object.keys(depois?.parametros || {})])) {
        if (!igual(antes?.parametros?.[k], depois?.parametros?.[k])) campos[k] = depois?.parametros?.[k] ?? null;
      }
      if (Object.keys(campos).length) patch.parametros = campos;
    } else if (!igual(antes?.[chave], depois?.[chave])) patch[chave] = depois?.[chave] ?? null;
  }
  return patch;
}
const aplicar = (base, patch) => ({ ...base, ...patch, parametros: { ...base?.parametros, ...patch?.parametros } });
export function criarSincronizacao({ salvar, aoMudar, normalizar = v => v }) {
  let geracao = 0, revisao = 0, config = null, confirmado = null, banco = null, status = 'carregando', erro = '', enviando = false;
  const estado = () => ({ config: copiar(config), status, erro });
  const avisar = () => aoMudar(estado());
  return {
    estado,
    limpar() { geracao++; revisao = 0; config = confirmado = banco = null; status = 'carregando'; erro = ''; enviando = false; avisar(); },
    carregar(valor, original = valor) { config = copiar(valor); confirmado = copiar(valor); banco = copiar(original); status = 'salvo'; erro = ''; avisar(); },
    alterar(fn) {
      if (!confirmado) throw new Error('Aguarde carregar as configurações antes de editar.');
      config = fn(copiar(config)); revisao++; status = 'pendente'; erro = ''; avisar();
    },
    async salvar() {
      if (!confirmado || enviando) return;
      const epoch = geracao;
      enviando = true;
      try {
        do {
          const patch = diferencaConfig(confirmado, config);
          if (!Object.keys(patch).length) { status = 'salvo'; avisar(); break; }
          const envio = copiar(config), rev = revisao;
          status = 'salvando'; erro = ''; avisar();
          const resposta = await salvar(patch, copiar(banco));
          if (epoch !== geracao) return;
          if (!resposta?.valor) throw new Error('O servidor não confirmou a configuração.');
          banco = copiar(resposta.valor);
          confirmado = normalizar(banco);
          config = rev === revisao ? copiar(confirmado) : aplicar(confirmado, diferencaConfig(envio, config));
          status = rev === revisao ? 'salvo' : 'pendente'; avisar();
        } while (status === 'pendente');
      } catch (e) {
        if (epoch !== geracao) return;
        status = 'erro'; erro = e.message || 'Não foi possível salvar.'; avisar();
      } finally { if (epoch === geracao) enviando = false; }
    },
  };
}
