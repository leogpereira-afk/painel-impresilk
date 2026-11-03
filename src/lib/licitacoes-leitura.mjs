// Um dono por leitura. Respostas atrasadas não sobrevivem à atualização ou
// desmontagem da área quando a sessão/permissão muda.
export function criarLeituraLicitacoes({consultar,receber}) {
  let sequencia=0,controller;
  return {
    async atualizar(chave){
      controller?.abort();controller=new AbortController();const atual=controller,id=++sequencia;
      receber({dados:null,carregando:true,erro:null,chave});
      try {
        const dados=await consultar(atual.signal,chave);
        if(id===sequencia&&!atual.signal.aborted)receber({dados,carregando:false,erro:null,chave});
      }catch(e){
        if(id===sequencia&&!atual.signal.aborted)receber({dados:null,carregando:false,erro:e?.message||'Não foi possível atualizar a leitura.',chave});
      }
    },
    cancelar(){sequencia++;controller?.abort();},
  };
}

// A exportação usa o relatório inteiro da seleção no instante do clique.
// Trocar relatório ou sessão cancela inclusive a entrega do arquivo.
export function criarExportacaoLicitacoes({gerar,receber}) {
  let controller,sequencia=0,pendente=null;
  return {
    baixar(dados){
      if(pendente)return pendente;
      if(dados?.estado!=='disponivel')return Promise.resolve();
      controller=new AbortController();const atual=controller,id=++sequencia;
      receber({carregando:true,erro:null});
      const operacao=(async()=>{
        try {
          await gerar(dados,{signal:atual.signal});
          if(id===sequencia&&!atual.signal.aborted)receber({carregando:false,erro:null});
        }catch(e){
          if(id===sequencia&&!atual.signal.aborted)receber({carregando:false,erro:e?.message||'Não foi possível gerar o resumo PDF. Tente novamente.'});
        }
      })();
      pendente=operacao;
      void operacao.finally(()=>{if(pendente===operacao)pendente=null;});
      return operacao;
    },
    cancelar(){sequencia++;controller?.abort();pendente=null;},
  };
}
