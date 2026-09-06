const diaLocal = em => {
 const d=new Date(em);
 return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(d):null;
};

// Uma unidade por execução mantém a rodada dentro do tempo do servidor.
// Sistemas ainda não tentados vêm antes das repetições; uma falha não prende a fila.
export function proximoBackup(chaves, sistemas, hoje) {
 const pendentes=chaves.filter(k=>!sistemas[k]?.ok || diaLocal(sistemas[k]?.em)!==hoje);
 return pendentes.find(k=>diaLocal(sistemas[k]?.em)!==hoje)
  ?? pendentes.sort((a,b)=>(Date.parse(sistemas[a]?.em)||0)-(Date.parse(sistemas[b]?.em)||0))[0]
  ?? null;
}

export async function executarBackupsSequenciais(chaves, executar, progresso=()=>{}) {
 if(!chaves.length)throw new Error('Nenhum sistema disponível para copiar. Atualize a consulta.');
 const sistemas={};
 for(const [indice,chave] of [...new Set(chaves)].entries()) {
  progresso({chave,numero:indice+1,total:chaves.length});
  try {
   const resultado=await executar(chave);
   if(typeof resultado?.sistemas?.[chave]?.ok!=='boolean')throw new Error('O servidor não confirmou esta cópia. Consulte a situação antes de repetir.');
   sistemas[chave]=resultado.sistemas[chave];
  }catch(e){sistemas[chave]={ok:false,erro:e.message || 'Falha ao copiar este sistema.'};}
 }
 return {sistemas};
}
