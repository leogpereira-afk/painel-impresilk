// Retentativas limitadas a falhas transitórias. Não repete pedidos recusados.
export async function buscarComRetentativa(url: string, opcoes: RequestInit, esperar = (ms:number)=>new Promise(r=>setTimeout(r,ms))) {
  for(let tentativa=0;;tentativa++) {
    let resposta: Response;
    try {
      resposta = await fetch(url,{...opcoes,signal:AbortSignal.timeout(25000)});
    } catch (erro) {
      // O transporte também pode sinalizar 429 como exceção, sem Response.
      // Somente esse limite temporário conhecido pode ser repetido.
      const mensagem=String((erro as Error)?.message || '');
      const espera=mensagem.match(/Rate limit exceeded[\s\S]*Retry after (\d+)ms/i);
      if(!espera || tentativa>=2) throw erro;
      await esperar(Math.min(45000,Math.max(1000,Number(espera[1])+250)));
      continue;
    }
    if(![429,502,503,504].includes(resposta.status) || tentativa>=2) return resposta;
    const cabecalho=resposta.headers.get('retry-after');
    const segundos=Number(cabecalho);
    const indicado = cabecalho ? (Number.isFinite(segundos)?segundos*1000:Date.parse(cabecalho)-Date.now()) : 0;
    await resposta.arrayBuffer();
    await esperar(Math.min(45000,Math.max(1000*(2**tentativa),Number.isFinite(indicado)?indicado:0)));
  }
}
