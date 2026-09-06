export async function trocarSenhaConsistente({aplicarAuth,salvarLegado,reporAuth}: {aplicarAuth?:()=>Promise<void>,salvarLegado:()=>Promise<void>,reporAuth?:()=>Promise<void>}) {
  if(aplicarAuth) await aplicarAuth();
  try { await salvarLegado(); }
  catch(e) {
    if(reporAuth) {
      try {await reporAuth();}
      catch {throw new Error('A nova senha está ativa na entrada central, mas a atualização das outras entradas falhou. Use a nova senha e tente a troca novamente para concluir a sincronização.');}
    }
    throw new Error('A troca não foi concluída. Sua senha anterior foi mantida; tente novamente.');
  }
}
