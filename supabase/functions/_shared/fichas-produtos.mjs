// Conteúdo editorial cadastrado pela direção, vinculado ao ID oficial do produto.
// Catálogo e roteiro genérico não comprovam especificação técnica ou preço.
export const CAMPOS_FICHA = {
  aplicacao:'Indicação de uso', materiais:'Materiais e acabamentos', diferencas:'Diferenças entre alternativas',
  tecnica:'Informações técnicas', perguntas:'Perguntas para orçar', cuidados:'Cuidados e limitações', exemplos:'Trabalhos da Impresilk',
};
export function validarFichasProdutos(entrada, produtos, autor, agora, anteriores={}) {
  if (entrada == null) return {};
  if (typeof entrada !== 'object' || Array.isArray(entrada) || Object.keys(entrada).length > 1000) throw new Error('Fichas de produtos inválidas.');
  const ids=new Set(produtos.map(p=>String(p.id))),saida={};
  for (const [id,f] of Object.entries(entrada)) {
    if (!ids.has(id) || !f || typeof f !== 'object' || Array.isArray(f)) throw new Error('Ficha sem produto válido no catálogo.');
    const ficha={};
    for (const campo of [...Object.keys(CAMPOS_FICHA),'fotoUrl','fonte','validadoPor','revisadoEm']) {
      if (f[campo]!=null && (typeof f[campo]!=='string' || f[campo].length>4000)) throw new Error('Conteúdo da ficha excede o limite permitido.');
      ficha[campo]=String(f[campo]||'').trim();
    }
    if (ficha.fotoUrl) {
      let url;try{url=new URL(ficha.fotoUrl);}catch{throw new Error('Informe um endereço válido para a foto.');}
      if(url.protocol!=='https:'||url.username||url.password||f.fotoAutorizada!==true) throw new Error('A foto exige endereço HTTPS e confirmação de uso autorizado.');
    }
    const complementos=f.complementos||[];
    if(!Array.isArray(complementos)||complementos.length>30||complementos.some(x=>!ids.has(String(x))||String(x)===id))throw new Error('Confira os produtos complementares.');
    ficha.complementos=[...new Set(complementos.map(String))];ficha.fotoAutorizada=f.fotoAutorizada===true;
    if(f.validada===true && (!ficha.fonte||!ficha.validadoPor||!/^\d{4}-\d{2}-\d{2}$/.test(ficha.revisadoEm)||Number.isNaN(Date.parse(ficha.revisadoEm+'T12:00:00Z'))||new Date(ficha.revisadoEm+'T12:00:00Z').toISOString().slice(0,10)!==ficha.revisadoEm||ficha.revisadoEm>agora.slice(0,10)))throw new Error('A validação técnica exige fonte, responsável e data de revisão válida.');
    ficha.validada=f.validada===true;const anterior=anteriores?.[id];const igual=anterior&&Object.entries(ficha).every(([k,v])=>JSON.stringify(v)===JSON.stringify(anterior[k]));ficha.atualizadoPor=igual?anterior.atualizadoPor:autor;ficha.atualizadoEm=igual?anterior.atualizadoEm:agora;saida[id]=ficha;
  }
  return saida;
}
