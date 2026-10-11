export const CATEGORIAS_SEGURANCA = ['Câmera','DVR/NVR','Alarme','Chave','Portão','Acesso facial','Relógio de ponto'];
export const CATEGORIAS_LEGADAS_SEGURANCA = {'Câmeras / CFTV':'Câmera','Portão / automatizador':'Portão'};
export const categoriaSeguranca = categoria => CATEGORIAS_LEGADAS_SEGURANCA[categoria] || categoria;
export const ativosSeguranca = itens => (itens || []).filter(item => item.tipo === 'seguranca');
export const contarCategoriasSeguranca = itens => ativosSeguranca(itens).reduce((totais,item)=>{const categoria=categoriaSeguranca(item.categoria);totais[categoria]=(totais[categoria]||0)+1;return totais;},{});
export const camerasAtivas = itens => ativosSeguranca(itens).filter(item => categoriaSeguranca(item.categoria) === 'Câmera' && item.especificacao?.situacao !== 'baixado');
export const itensConferenciaVazios = itens => camerasAtivas(itens).map(camera=>({cameraId:camera.id,status:''}));
export const conferenciaCompleta = (itens,cameras) => Array.isArray(itens) && itens.length===cameras.length && cameras.every(camera=>itens.some(i=>i.cameraId===camera.id&&['gravando','sem-imagem','fora-posicao'].includes(i.status)));
export const ocupacaoGravadores = itens => {
  const cameras = camerasAtivas(itens);
  return Object.fromEntries(ativosSeguranca(itens).filter(i => categoriaSeguranca(i.categoria) === 'DVR/NVR').map(gravador => {
    const ligadas = cameras.filter(c => c.especificacao?.gravadorId === gravador.id);
    const canais = [...new Set(ligadas.map(c => String(c.especificacao?.canal || '').trim()).filter(Boolean))];
    return [gravador.id, {cameras:ligadas.length, canaisOcupados:canais.length, canais, duplicados:canais.filter(c => ligadas.filter(i=>String(i.especificacao?.canal||'').trim()===c).length>1), total:Number(gravador.especificacao?.canaisTotais)||null}];
  }));
};
export const copiasEmPosse = item => (item.especificacao?.copias || []).filter(c => c.pessoaId && c.entrega && !c.devolucao);
export const autorizacoesAbertas = item => (item.especificacao?.autorizados || []).filter(a => a.pessoaId && a.liberadoEm && !a.bloqueadoEm);
export function pendenciasDesligamento(pessoaId, itens=[], controles={}) {
  if (!pessoaId) return [];
  const achados = [];
  for (const item of ativosSeguranca(itens)) {
    for (const copia of copiasEmPosse(item).filter(c=>c.pessoaId===pessoaId)) achados.push({tipo:copia.tipo||'chave',nome:item.nome,itemId:item.id,registroId:copia.id});
    for (const autorizacao of autorizacoesAbertas(item).filter(a=>a.pessoaId===pessoaId)) achados.push({tipo:categoriaSeguranca(item.categoria)==='Alarme'?'alarme':'acesso facial',nome:item.nome,itemId:item.id,registroId:autorizacao.id});
  }
  for (const [id,registro] of Object.entries(controles || {})) if (registro?.pessoaId === pessoaId && ['celulares','ramais'].includes(registro.tipo)) achados.push({tipo:registro.tipo==='celulares'?'linha celular':'ramal',nome:registro.numero||id,registroId:id});
  for (const item of (itens||[])) if (item.tipo==='informatica' && ['Computador','Notebook'].includes(item.categoria) && item.responsavelId===pessoaId && item.especificacao?.situacao!=='baixado') achados.push({tipo:'computador',nome:item.nome,itemId:item.id});
  return achados;
}
export function historicoPreservado(anterior, atual, chave) {
  return (anterior?.especificacao?.[chave] || []).every(old => {
    if (!(old.entrega || old.liberadoEm || old.devolucao || old.bloqueadoEm)) return true;
    const novo=(atual?.especificacao?.[chave] || []).find(x=>x.id===old.id);
    if (!novo) return false;
    if (old.devolucao || old.bloqueadoEm) return JSON.stringify(novo)===JSON.stringify(old);
    return Object.keys(old).every(campo=>['devolucao','bloqueadoEm'].includes(campo) || novo[campo]===old[campo]);
  });
}
