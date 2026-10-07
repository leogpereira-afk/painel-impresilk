export async function carregarCatalogoComercial(buscar) {
 const vendedores=await buscar('usuario/vendedor');
 const produtos=await buscar('produto');
 if(!Array.isArray(vendedores)||!Array.isArray(produtos)||!vendedores.length||!produtos.length)throw new Error('Catálogo incompleto; mantida a cópia anterior.');
 const vs=vendedores.map(v=>{if(!/^[1-9]\d*$/.test(String(v.id))||!v.nome)throw new Error('Vendedor sem identificação.');return {id:String(v.id),nome:String(v.nome).trim(),status:String(v.status||'')};});
 if(new Set(vs.map(v=>v.id)).size!==vs.length)throw new Error('IDs duplicados no catálogo.');
 if(produtos.some(p=>!p.id||!String(p.nome||'').trim())||new Set(produtos.map(p=>String(p.id))).size!==produtos.length)throw new Error('Produtos sem identificação ou duplicados; mantida a cópia anterior.');
 return {versao:1,completo:true,vendedores:vs,produtos:produtos.map(p=>({id:String(p.id||''),nome:String(p.nome||''),categoria:String(p.categoria||''),descricao:String(p.descricao||''),unidade:p.unidade?String(p.unidade):null})),metas:{disponivel:false,motivo:'Não há rota de metas na OpenAPI 1.1.0.'}};
}
