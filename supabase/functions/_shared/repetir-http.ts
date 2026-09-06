// Retentativas limitadas a falhas transitórias. Não repete pedidos recusados.
export async function buscarComRetentativa(url: string, opcoes: RequestInit, esperar = (ms:number)=>new Promise(r=>setTimeout(r,ms))) {
  for(let tentativa=0;;tentativa++) {
    const resposta = await fetch(url,{...opcoes,signal:AbortSignal.timeout(25000)});
    if(![429,502,503,504].includes(resposta.status) || tentativa>=2) return resposta;
    const cabecalho=resposta.headers.get('retry-after');
    const segundos=Number(cabecalho);
    const indicado = cabecalho ? (Number.isFinite(segundos)?segundos*1000:Date.parse(cabecalho)-Date.now()) : 0;
    await resposta.arrayBuffer();
    await esperar(Math.min(45000,Math.max(1000*(2**tentativa),Number.isFinite(indicado)?indicado:0)));
  }
}
