import {confirmarPresenca,minhaPresenca,avisosReunioes} from '../../supabase/functions/_shared/reunioes-presenca.mjs';
import {prepararReuniao,carimbarReuniao,novoRegistro,validarArquivoReuniao,agendaReunioes} from '../../supabase/functions/_shared/reunioes.mjs';
export const pessoasReuniaoDemo=[{id:'rh-ana',nome:'Ana Exemplo',areaId:'fin',area:'Financeiro',cargo:'Analista financeiro'},{id:'rh-bruno',nome:'Bruno Exemplo',areaId:'prod',area:'Produção',cargo:'Impressor'},{id:'rh-carla',nome:'Carla Exemplo',areaId:'com',area:'Comercial',cargo:'Consultora comercial'},{id:'rh-davi',nome:'Davi Exemplo',areaId:'prod',area:'Produção',cargo:'Instalador'}];
const convidado=new URLSearchParams(window.location.search).get('perfil')==='reuniao-convidado';
const s=convidado?{sub:'ana-demo',nome:'Ana Exemplo',master:false}:{sub:'demo',nome:'Conta de demonstração',master:true},identidade={rhId:'rh-ana',motivo:''},itens=new Map(),arquivos=new Map();
const base={id:'encontro-demo',titulo:'Treinamento de instalação · exemplo',tipo:'treinamento',setor:'producao',situacao:'agendado',data:new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),inicio:'09:00',fim:'10:00',local:'Sala de treinamento',responsavel:'Ana Exemplo',pauta:'Conferência do material antes da saída e registro da entrega.',ata:'',participantes:[{id:'p1',rhId:'rh-ana',nome:'Ana Exemplo',presenca:'pendente'},{id:'p2',rhId:'rh-bruno',nome:'Bruno Exemplo',presenca:'pendente'}],decisoes:[],versaoAnterior:null};
itens.set(base.id,carimbarReuniao(prepararReuniao(base,null,{sub:'demo',nome:'Organizador',master:true},new Date().toISOString(),pessoasReuniaoDemo),{sub:'demo',nome:'Organizador',master:true},'Criou o encontro'));
const apresentar=r=>({...r,podeEditar:!convidado,minhaPresenca:minhaPresenca(r,identidade)});
export function respostaReunioes(b){
 let dados;try{
 const r=itens.get(b.id||b.item?.id);
 if(b.action==='avisos')dados={avisos:avisosReunioes([...itens.values()],identidade)};
 else if(b.action==='pessoas')dados={pessoas:pessoasReuniaoDemo};
 else if(b.action==='agenda')dados={eventos:agendaReunioes([...itens.values()],b.mes)};
 else if(b.action==='listar')dados={itens:[...itens.values()].map(apresentar)};
 else if(b.action==='salvar'){const n=carimbarReuniao(prepararReuniao(b.item,r,s,new Date().toISOString(),pessoasReuniaoDemo),s,r?'Editou o encontro':'Criou o encontro');itens.set(n.id,n);dados={item:apresentar(n)};}
 else if(!r)throw new Error('Encontro não encontrado.');
 else if(b.action==='presenca'){const n=confirmarPresenca(r,s,identidade,b);itens.set(n.id,n);dados={item:apresentar(n)};}
 else if(b.action==='arquivo'){const url=arquivos.get(b.arquivoId);if(!url)throw new Error('Arquivo não encontrado.');dados={url};}
 else{
 if(r.versao!==b.versao)throw new Error('Encontro atualizado. Reabra a ficha.');
 let n;
 if(b.action==='registro')n=novoRegistro(r,b.texto,s);
 else if(b.action==='anexar'){
 if(r.anexos.length>=20)throw new Error('Limite de 20 arquivos.');
 const bytes=Uint8Array.from(atob(b.base64),c=>c.charCodeAt(0)),a=validarArquivoReuniao(b.nome,b.mime,bytes.length),id=crypto.randomUUID();
 arquivos.set(id,URL.createObjectURL(new Blob([bytes],{type:a.mime})));n={...r,anexos:[...r.anexos,{...a,id,em:new Date().toISOString(),nomeAutor:s.nome}]};
 }else throw new Error('Ação inválida.');
 n=carimbarReuniao(n,s,b.action==='registro'?'Acrescentou um registro':'Anexou arquivo');itens.set(n.id,n);dados={item:apresentar(n)};
 }
 return new Response(JSON.stringify({ok:true,...dados}),{headers:{'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({erro:e.message}),{status:e.status||422});}
}
