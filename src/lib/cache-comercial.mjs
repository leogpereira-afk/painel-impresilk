// Dados ficam apenas em memória, em um único escopo por vez.
export function criarCacheComercial({ttl=30_000,limite=8,relogio=Date.now}={}) {
  const entradas=new Map();let escopo='',geracao=0;
  const limpar=()=>{entradas.clear();geracao++;};
  return {
    limpar,
    async consultar(novoEscopo,chave,carregar,signal) {
      if(escopo!==novoEscopo){limpar();escopo=novoEscopo;}
      if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');
      const salva=entradas.get(chave),inicio=geracao;
      if(salva&&relogio()-salva.em<ttl)return salva.dados;
      const dados=await carregar();
      if(!signal?.aborted&&inicio===geracao&&escopo===novoEscopo){
        if(entradas.size>=limite)entradas.delete(entradas.keys().next().value);
        entradas.set(chave,{dados,em:relogio()});
      }
      return dados;
    },
  };
}
