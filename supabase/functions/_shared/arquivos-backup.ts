// Arquivos são copiados com os bytes e conferidos pelo SHA-256.
export const base64 = (bytes: Uint8Array): string => {
  let texto = '';
  for (let i = 0; i < bytes.length; i += 32768) texto += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(texto);
};
export const bytesDe = (texto: string) => Uint8Array.from(atob(texto), c => c.charCodeAt(0));
export const resumo = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
const ausente = (erro: any) => ['404','not_found'].includes(String(erro?.statusCode || erro?.code)) || /object not found/i.test(erro?.message || '');

export async function capturarArquivos(bucket: any) {
  const arquivos: any[] = [];
  const visitar = async (prefixo: string) => {
    for (let offset = 0; ; offset += 100) {
      const {data,error} = await bucket.list(prefixo,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
      if(error) throw new Error('Não foi possível listar os arquivos: '+error.message);
      for(const item of data || []) {
        const caminho = [prefixo,item.name].filter(Boolean).join('/');
        if(!item.id) {await visitar(caminho);continue;}
        const {data:blob,error:falha} = await bucket.download(caminho);
        if(falha || !blob) throw new Error('Arquivo não copiado: '+caminho);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        arquivos.push({caminho,tipo:blob.type || 'application/octet-stream',bytes:bytes.length,sha256:await resumo(bytes),base64:base64(bytes)});
      }
      if(!data || data.length<100) break;
    }
  };
  await visitar('');
  return arquivos;
}

export async function prepararArquivos(bucket: any, arquivos: any[], resolver?: (a:any)=>Promise<Uint8Array>) {
  if(!Array.isArray(arquivos)) throw new Error('Manifesto de arquivos inválido.');
  const preparados: any[] = [], vistos = new Set();
  // Valida o conjunto inteiro antes da primeira gravação.
  for(const a of arquivos) {
    if(!a || typeof a.caminho!=='string' || a.caminho.startsWith('/') || a.caminho.split('/').some((s:string)=>!s || s==='..' || s==='.') || vistos.has(a.caminho)) throw new Error('Caminho de arquivo inválido ou repetido.');
    vistos.add(a.caminho);
    const bytes = typeof a.base64==='string' ? bytesDe(a.base64) : resolver ? await resolver(a) : null;
    if(!bytes || bytes.length!==a.bytes || await resumo(bytes)!==a.sha256) throw new Error('A conferência do arquivo falhou: '+a.caminho);
    preparados.push({...a,conteudo:bytes});
  }
  const criados: string[] = [];
  const desfazer = async () => {
    if(!criados.length) return;
    const {error} = await bucket.remove(criados);
    if(error) throw new Error('Os dados não foram restaurados; a limpeza dos arquivos novos precisa ser repetida.');
  };
  try {
    for(const a of preparados) {
      const {data,error} = await bucket.download(a.caminho);
      if(data) {
        if(await resumo(new Uint8Array(await data.arrayBuffer()))!==a.sha256) throw new Error('Já existe um arquivo diferente neste caminho: '+a.caminho);
        continue;
      }
      if(error && !ausente(error)) throw new Error('Não foi possível conferir o arquivo existente: '+a.caminho);
      const {error:falha} = await bucket.upload(a.caminho,a.conteudo,{contentType:a.tipo,upsert:false});
      if(falha) throw new Error('Não foi possível recuperar o arquivo: '+a.caminho);
      criados.push(a.caminho);
      const {data:conferido,error:falhaLeitura} = await bucket.download(a.caminho);
      if(falhaLeitura || !conferido || await resumo(new Uint8Array(await conferido.arrayBuffer()))!==a.sha256) throw new Error('Arquivo enviado sem confirmação: '+a.caminho);
    }
    return {quantidade:preparados.length,desfazer};
  } catch(e) {await desfazer();throw e;}
}
