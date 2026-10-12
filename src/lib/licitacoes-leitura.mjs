// Um dono por leitura. Respostas atrasadas não sobrevivem à atualização ou
// desmontagem da área quando a sessão/permissão muda.
export function criarLeituraLicitacoes({consultar,receber}) {
  let sequencia=0,controller;
  return {
    async atualizar(){
      controller?.abort();controller=new AbortController();const atual=controller,id=++sequencia;
      receber({dados:null,carregando:true,erro:null});
      try {
        const dados=await consultar(atual.signal);
        if(id===sequencia&&!atual.signal.aborted)receber({dados,carregando:false,erro:null});
      }catch(e){
        if(id===sequencia&&!atual.signal.aborted)receber({dados:null,carregando:false,erro:e?.message||'Não foi possível atualizar a leitura.'});
      }
    },
    cancelar(){sequencia++;controller?.abort();},
  };
}
