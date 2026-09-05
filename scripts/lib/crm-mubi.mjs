// Campos confirmados pela sonda de 05/09; projeções mínimas, sem observações privadas.
const texto=x=>typeof x==='string'?x.trim():'';
const codigo=x=>/^[1-9]\d*$/.test(String(x??''))?String(x):'';
export function normalizarCliente(c){
 if(!codigo(c?.id)||typeof c.nome_fantasia!=='string')throw new Error('Formato de cliente inesperado');
 return {id:codigo(c.id),nome:texto(c.nome_fantasia),razaoSocial:texto(c.razao_social),documento:texto(c.cnpj_cpf).replace(/\D/g,''),telefone:texto(c.telefone_pri),email:texto(c.email),origem:texto(c.origem),classificacao:texto(c.classificacao),responsavel:texto(c.vendedor),status:texto(c.status),
 contatos:(Array.isArray(c.contatos)?c.contatos:[]).map((x,i)=>({id:codigo(x.id)||String(i),nome:texto(x.nome_contato),celular:texto(x.celular),email:texto(x.email),financeiro:x.contato_financeiro==='Sim',status:texto(x.status)})).filter(x=>x.nome||x.celular||x.email)};
}
export function normalizarCard(c,usuarios){
 if(!codigo(c?.id)||!codigo(c.grupo?.id)||!codigo(c.fase?.id)||typeof c.titulo!=='string')throw new Error('Formato de oportunidade inesperado');
 return {id:codigo(c.id),clienteId:codigo(c.cliente?.id),cliente:texto(c.cliente?.nome)||texto(c.nome_cliente),titulo:texto(c.titulo),grupoId:codigo(c.grupo.id),grupo:texto(c.grupo.nome),faseId:codigo(c.fase.id),fase:texto(c.fase.nome),origem:texto(c.origem?.nome),responsavel:usuarios.get(codigo(c.responsavel))||'',responsavelId:codigo(c.responsavel),valor:typeof c.valor==='number'&&Number.isFinite(c.valor)?c.valor:null,status:texto(c.status),movidoEm:texto(c.movido),ultimaInteracao:texto(c.ultima_interacao),criadoEm:texto(c.data_cadastro)};
}
export async function carregarClientes(buscar){const xs=await buscar('cliente');if(!xs.length)throw new Error('Cadastro vazio; mantido anterior');const itens=xs.map(normalizarCliente);return {versao:1,completo:true,clientes:Object.fromEntries(itens.map(x=>[x.id,x]))};}
export async function carregarFunil(buscar){
 const usuarios=new Map((await buscar('usuario')).map(x=>[codigo(x.id),texto(x.nome)]));
 const grupos=await buscar('funil-vendas-grupo');if(!grupos.length)throw new Error('Funil vazio; mantido anterior');
 const saida=[],cards=new Map();
 for(const g of grupos){if(!codigo(g.id))throw new Error('Grupo sem identificação');const fases=await buscar(`funil-vendas-fase/grupo/${g.id}`);if(!fases.length)throw new Error('Grupo sem fases; mantido anterior');
 saida.push({id:codigo(g.id),nome:texto(g.nome),fases:fases.map(f=>{if(!codigo(f.id))throw new Error('Fase sem identificação');return {id:codigo(f.id),nome:texto(f.nome),ordem:Number(f.sequencia)||0};}).sort((a,b)=>a.ordem-b.ordem)});
 for(const f of fases){for(const c of await buscar('funil-vendas-card',{grupo_id:g.id,fase_id:f.id,status:'ATIVO'})){const n=normalizarCard(c,usuarios);if(n.grupoId!==codigo(g.id)||n.faseId!==codigo(f.id))throw new Error('Oportunidade fora da fase solicitada');cards.set(n.id,n);}}
 }
 return {versao:1,completo:true,escopo:'ATIVO',grupos:saida,cards:[...cards.values()]};
}
