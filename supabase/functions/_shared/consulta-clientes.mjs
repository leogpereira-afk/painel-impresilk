// Consulta cadastral global: projeção explícita, sem histórico ou contatos.
export const normalizarBuscaCliente=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
export const normalizarDocumento=v=>String(v??'').toUpperCase().replace(/[\s./-]/g,'');
export function clienteCorresponde(c,busca){
 const q=normalizarBuscaCliente(busca);
 if(!q)return true;
 const documento=/^[\d\s./-]+$/.test(q)?q.replace(/\D/g,''):'';
 if(documento)return normalizarDocumento(c.documento).includes(documento);
 const alfa=normalizarDocumento(q);
 if(/^[A-Z0-9]{3,14}$/.test(alfa)&&normalizarDocumento(c.documento).includes(alfa))return true;
 const nome=normalizarBuscaCliente(`${c.nome||''} ${c.razaoSocial||''}`);
 return q.split(' ').every(p=>nome.includes(p));
}
export function consultarClientes(fonte,{busca,pagina=1}={}){
 const erro=(mensagem,status=400)=>{throw Object.assign(new Error(mensagem),{status});};
 if(typeof busca!=='string'||busca.length>160)erro('Informe um nome ou CNPJ de até 160 caracteres.');
 const q=normalizarBuscaCliente(busca),numerica=/^[\d\s./-]+$/.test(q),digitos=q.replace(/\D/g,'');
 if(numerica?digitos.length<3:q.replace(/[^a-z0-9]/g,'').length<3)erro('Digite pelo menos 3 letras do nome ou 3 números do documento.');
 if(!Number.isSafeInteger(pagina)||pagina<1||pagina>10000)erro('Página inválida.');
 if(fonte?.valor?.completo!==true||!fonte.valor.clientes||typeof fonte.valor.clientes!=='object')erro('O cadastro de clientes ainda não está disponível por completo. Atualize a integração antes de conferir.',503);
 const encontrados=Object.values(fonte.valor.clientes).filter(c=>c&&c.id!=null&&clienteCorresponde(c,q));
 encontrados.sort((a,b)=>(Number(numerica&&String(b.documento||'').replace(/\D/g,'')===digitos)-Number(numerica&&String(a.documento||'').replace(/\D/g,'')===digitos))||normalizarBuscaCliente(a.nome||a.razaoSocial).localeCompare(normalizarBuscaCliente(b.nome||b.razaoSocial),'pt-BR')||String(a.id).localeCompare(String(b.id),'pt-BR',{numeric:true}));
 const porPagina=20,total=encontrados.length,paginas=Math.max(1,Math.ceil(total/porPagina));
 if(pagina>paginas)erro('Esta página não está mais disponível. Consulte novamente.');
 return {busca:busca.trim(),pagina,porPagina,total,paginas,atualizadoEm:fonte.atualizado_em||null,clientes:encontrados.slice((pagina-1)*porPagina,pagina*porPagina).map(c=>({id:String(c.id),nome:String(c.nome||c.razaoSocial||'Nome não informado'),razaoSocial:String(c.razaoSocial||''),documento:String(c.documento||''),responsavel:String(c.responsavel||''),status:String(c.status||'')}))};
}
