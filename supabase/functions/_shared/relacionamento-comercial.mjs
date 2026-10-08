import {normalizarDocumento} from './consulta-clientes.mjs';
// Contrato compartilhado entre servidor, interface e demonstração local.
export const TIPOS_ACAO={acompanhamento:'Acompanhamento',prospeccao:'Prospecção',pos_venda:'Pós-venda',relacionamento:'Estratégia de relacionamento',reativacao:'Reativação'};
export const CANAIS={ligacao:'Ligação',whatsapp:'WhatsApp',email:'E-mail',visita:'Visita',reuniao:'Reunião',outro:'Outro'};
export const FASES_ACAO={planejada:'Planejada',em_andamento:'Em andamento',aguardando_cliente:'Aguardando cliente',aguardando_equipe:'Aguardando equipe'};
export const BRIEFING_CAMPOS={objetivo:'Objetivo da comunicação',medidas:'Medidas, quantidades e unidades',ambiente:'Ambiente e superfície',material:'Material e acabamento',arte:'Arte e versão',aprovador:'Quem aprova',instalacao:'Acesso, fixação e instalação',prazoDesejado:'Prazo desejado / data do evento',prazoConfirmado:'Prazo confirmado pela operação',pendenciaResponsavel:'Responsável pela pendência',referencias:'Links de fotos e referências'};
const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const erro=(mensagem,status=400)=>{throw Object.assign(new Error(mensagem),{status});};
const texto=(v,max,nome)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)erro(`${nome}: limite de ${max} caracteres.`);return v.trim();};
export function clienteBasico(c){return {id:String(c.id),nome:String(c.nome||c.razaoSocial||'Cliente'),razaoSocial:String(c.razaoSocial||''),documento:String(c.documento||''),responsavel:String(c.responsavel||'')};}
export function cnpjValido(v){
 const n=normalizarDocumento(v);if(!/^[A-Z0-9]{12}\d{2}$/.test(n)||/^(\d)\1+$/.test(n))return false;
 const digito=s=>{let peso=s.length-7,soma=0;for(const x of s){soma+=(x.charCodeAt(0)-48)*peso--;if(peso<2)peso=9;}const resto=soma%11;return resto<2?0:11-resto;};
 return digito(n.slice(0,12))===Number(n[12])&&digito(n.slice(0,13))===Number(n[13]);
}
export function contextoDaAcao(b,base){
 const tipoAcao=b.tipoAcao||'acompanhamento';if(!Object.hasOwn(TIPOS_ACAO,tipoAcao))erro('Tipo de ação inválido.');
 const clientes=base.clientes||[],consulta=base.clientesConsulta||[];
 let c=clientes.find(c=>String(c.id)===String(b.clienteId)),prospecto=null;
 if(b.prospecto){
  if(tipoAcao==='pos_venda'||b.ordemId||b.orcamentoId)erro('Prospecto local ainda não possui venda ou orçamento vinculado.');
  if(base.cadastroCompleto!==true)erro('Confira a sincronização do cadastro antes de criar um prospecto.',503);
  const p=b.prospecto,nome=texto(p.nome,180,'Nome do prospecto'),documento=normalizarDocumento(p.documento);
  if(!/^[\w-]{1,80}$/.test(p.id||'')||nome.length<3)erro('Informe o nome do prospecto com pelo menos 3 letras.');
  if(documento&&!cnpjValido(documento))erro('Informe um CNPJ válido ou deixe o documento em branco.');
  if([...clientes,...consulta].some(x=>documento?normalizarDocumento(x.documento)===documento:normal(x.nome)===normal(nome)||normal(x.razaoSocial)===normal(nome)))erro('Já existe um cadastro para esta empresa. Localize e selecione o cliente.',409);
  prospecto={id:p.id,nome,documento};c={id:`prospecto:${p.id}`,nome,documento};
 }else if(!c&&tipoAcao!=='acompanhamento'){if(base.cadastroCompleto!==true)erro('Confira a sincronização do cadastro antes de vincular o cliente.',503);c=consulta.find(c=>String(c.id)===String(b.clienteId));}
 if(!c)erro('Cliente fora do seu acesso.',403);
 const orcamentoId=String(b.orcamentoId||''),ordemId=String(b.ordemId||'');
 const o=orcamentoId?(base.orcamentos||[]).find(o=>String(o.id)===orcamentoId):null;
 const venda=ordemId?(base.vendasCliente||[]).find(v=>String(v.id)===ordemId):null;
 if(orcamentoId&&(!o||String(o.clienteId)!==String(c.id)))erro('Cliente ou orçamento fora do seu acesso.',403);
 if(ordemId&&(!venda||String(venda.clienteId)!==String(c.id)))erro('Venda fora do seu acesso ou de outro cliente.',403);
 if(tipoAcao==='pos_venda'&&!ordemId)erro('Selecione a venda para acompanhar o pós-venda.');
 const objetivo=texto(b.objetivo,500,'Objetivo'),estrategia=texto(b.estrategia,3000,'Estratégia'),resultado=texto(b.resultado,3000,'Resultado');
 if(tipoAcao!=='acompanhamento'&&!objetivo)erro('Informe o objetivo desta ação.');
 if(tipoAcao!=='acompanhamento'&&b.status==='concluida'&&!resultado)erro('Registre o resultado antes de concluir.');
 const canal=b.canal||'outro',fase=b.fase||'planejada',prioridade=b.prioridade||'normal';
 if(!Object.hasOwn(CANAIS,canal)||!Object.hasOwn(FASES_ACAO,fase)||!['normal','alta'].includes(prioridade))erro('Canal, etapa ou prioridade inválida.');
 const briefing={};if(b.briefing!=null&&(typeof b.briefing!=='object'||Array.isArray(b.briefing)))erro('Briefing inválido.');
 for(const [k,l] of Object.entries(BRIEFING_CAMPOS)){const v=texto(b.briefing?.[k],1500,l);if(v)briefing[k]=v;}
 return {c,o,tipoAcao,prospecto,clienteId:String(c.id),clienteDocumento:String(c.documento||''),responsavelCarteira:String(c.responsavel||''),ordemId,ordemNumero:String(venda?.numero||''),objetivo,estrategia,resultado,canal,fase,prioridade,briefing};
}
export function situacaoRelacionamento(a,hoje){return a.status==='concluida'?'concluidas':a.data<hoje?'atrasadas':a.data===hoje?'hoje':'programadas';}
export function resumirRelacionamento(acoes,{busca='',tipo='',situacao='abertas'}={},hoje){
 const todas=acoes.filter(a=>a.origem!=='mesa'&&a.tipoAcao&&a.tipoAcao!=='acompanhamento');
 const q=normal(busca),numeros=/^[\d\s./-]+$/.test(q)?q.replace(/\D/g,''):'';
 const encontradas=todas.filter(a=>(!tipo||a.tipoAcao===tipo)&&(!q||(numeros?normalizarDocumento(a.clienteDocumento||a.prospecto?.documento).includes(numeros):(/^[A-Z0-9]{3,14}$/.test(normalizarDocumento(q))&&normalizarDocumento(a.clienteDocumento||a.prospecto?.documento).includes(normalizarDocumento(q)))||q.split(' ').every(p=>normal([a.cliente,a.descricao,a.objetivo,a.estrategia,a.ordemNumero,a.clienteDocumento,a.prospecto?.documento].join(' ')).includes(p)))));
 const abertas=encontradas.filter(a=>a.status!=='concluida');
 const itens=encontradas.filter(a=>situacao==='todas'||(situacao==='abertas'?a.status!=='concluida':situacaoRelacionamento(a,hoje)===situacao));
 itens.sort((a,b)=>(Number(a.status==='concluida')-Number(b.status==='concluida'))||String(a.data).localeCompare(String(b.data))||(Number(b.prioridade==='alta')-Number(a.prioridade==='alta'))||String(a.cliente).localeCompare(String(b.cliente),'pt-BR'));
 return {itens,abertas:abertas.length,hoje:abertas.filter(a=>a.data===hoje).length,atrasadas:abertas.filter(a=>a.data<hoje).length,concluidas:encontradas.length-abertas.length};
}
export function alertasComerciais(dados,agora=Date.now()){
 const xs=[];
 for(const [id,nome,horas] of [['orcamentos','Orçamentos',3],['crm_clientes','Cadastro de clientes',26],['comercial_catalogo','Vendedores e produtos',26],['crm','Funil comercial',3]]){
  const fonte=dados.fontes?.[id];if(!fonte)continue;
  const em=Date.parse(fonte.atualizadoEm);if(!Number.isFinite(em)||agora-em>horas*3600000)xs.push({id,texto:`${nome}: atualização precisa ser conferida.`,em:fonte.atualizadoEm||null});
 }
 if(dados.base?.coberturaHistorica?.completo===false)xs.push({id:'historico',texto:'Histórico de clientes parcial. Reativação considera apenas compras identificadas.'});
 const negativas=(dados.relatorio?.vendas||[]).filter(o=>o.centavos<0);if(negativas.length)xs.push({id:'negativas',texto:`${negativas.length} pedido(s) com líquido negativo: conferir o ajuste na origem antes de avaliar resultados.`});
 return xs;
}
