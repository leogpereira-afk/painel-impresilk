// Contrato compartilhado da agenda própria de reuniões. Não altera eventos do RH/PCP.
export const COLECAO_REUNIOES='reunioes_empresa';
export const MAX_ARQUIVO_REUNIAO=5*1024*1024;
export const SETORES_REUNIAO={empresa:'Empresa toda',financeiro:'Financeiro',comercial:'Comercial',producao:'Produção',outros:'Outros setores'};
// Diretório mínimo. Não exporta documentos, contatos, remuneração ou saúde.
export function pessoasParaReunioes(colaboradores=[],status=[],areas=[],cargos=[]){
 const ativos=new Set(status.filter(s=>s.contaComoAtivo===true||s.contaComoAtivo==='true').map(s=>String(s.id)));
 const nomes=xs=>new Map(xs.map(x=>[String(x.id),String(x.nome||'').slice(0,180)]));
 const areaPorId=nomes(areas),cargoPorId=nomes(cargos);
 return colaboradores.filter(c=>c.nome&&!c.dataDesligamento&&(ativos.has(String(c.statusId))||c.ehDirecao===true||c.ehDirecao==='true'||c.statusId==='direcao'))
  .map(c=>({id:String(c.id),nome:String(c.nome).slice(0,180),areaId:String(c.areaId||''),area:areaPorId.get(String(c.areaId))||'Sem setor no RH',cargo:cargoPorId.get(String(c.cargoId))||''}))
  .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.id.localeCompare(b.id));
}
export function agendaReunioes(itens,mes){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes||''))throw new ErroReuniao('Informe um mês válido.');
 return itens.filter(r=>r.situacao!=='cancelado'&&dataValida(r.data)&&r.data.startsWith(mes)).map(r=>({
  id:'reuniao:'+r.id,reuniaoId:r.id,titulo:r.titulo,data:r.data,hora:`${r.inicio}–${r.fim}`,
  tipo:r.tipo==='treinamento'?'Treinamento':'Reunião',cor:'#4f46e5',setor:SETORES_REUNIAO[r.setor]||'Outros setores',
  descricao:[SETORES_REUNIAO[r.setor]||'Outros setores',r.local].filter(Boolean).join(' · '),recorrenteAnual:false,
 }));
}
export class ErroReuniao extends Error { constructor(message,status=422){super(message);this.status=status;} }
const falhar=(m,s)=>{throw new ErroReuniao(m,s);};
const texto=(v,max,rotulo,obrigatorio=false)=>{if(typeof v!=='string'||v.length>max||(obrigatorio&&!v.trim()))falhar(`Confira ${rotulo}${obrigatorio?' (obrigatório)':''}.`);return v.trim();};
export const idValido=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
export function dataValida(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!s.startsWith('0000')&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
export const podeEditarReuniao=(r,s)=>!!s&&(s.master===true||r?.criadoPor===s.sub);
export function prepararReuniao(c,anterior,s,agora=new Date().toISOString(),pessoasRH=[]){
 if(!c||typeof c!=='object'||Array.isArray(c))falhar('Informe os dados do encontro.');
 if(!idValido(c.id))falhar('Identificador do encontro inválido.');
 if(anterior&&!podeEditarReuniao(anterior,s))falhar('Somente quem criou ou a direção pode alterar este encontro.',403);
 if((c.versaoAnterior??null)!==(anterior?.versao??null))falhar('Este encontro foi atualizado. Reabra a ficha antes de salvar.',409);
 const titulo=texto(c.titulo,180,'o título',true);
 const setor=c.setor??anterior?.setor??'outros';
 if(!Object.hasOwn(SETORES_REUNIAO,setor))falhar('Escolha o setor do encontro.');
 if(!['reuniao','treinamento'].includes(c.tipo))falhar('Escolha reunião ou treinamento.');
 if(!['agendado','realizado','cancelado'].includes(c.situacao))falhar('Escolha a situação do encontro.');
 if(!dataValida(c.data))falhar('Informe uma data válida.');
 const horario=h=>typeof h==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(h);
 if(!horario(c.inicio)||!horario(c.fim)||c.fim<=c.inicio)falhar('O horário final precisa ser após o início, no mesmo dia.');
 const local=texto(c.local??'',250,'o local'),responsavel=texto(c.responsavel??'',180,'o responsável',true);
 const pauta=texto(c.pauta??'',20000,'a pauta'),ata=texto(c.ata??'',100000,'a ata');
 if(!Array.isArray(c.participantes)||c.participantes.length>150)falhar('Informe até 150 participantes.');
 if(c.participantes.some(p=>!p||typeof p!=='object'))falhar('Confira a lista de participantes.');
 const porRH=new Map(pessoasRH.map(p=>[p.id,p]));
 const participantes=c.participantes.map(p=>{
  const rhId=p.rhId||null,antigo=rhId&&anterior?.participantes?.find(a=>a.id===p.id&&a.rhId===rhId);
  if(rhId&&!idValido(rhId))falhar('Vínculo com o RH inválido.');
  const rh=rhId?porRH.get(rhId):null;
  if(rhId&&!rh&&!antigo)falhar('Pessoa não disponível no RH. Atualize a lista antes de incluir.');
  // Preserva a identificação histórica, mesmo se a ficha sair do quadro.
  const origem=antigo||rh||p;
  return {id:p.id,rhId,nome:texto(origem.nome,180,'o nome do participante',true),area:rhId?String(origem.area||'').slice(0,180):'',cargo:rhId?String(origem.cargo||'').slice(0,180):'',presenca:p.presenca||'pendente'};
 });
 if(participantes.some(p=>!idValido(p.id)||!['pendente','presente','ausente','justificada'].includes(p.presenca))||new Set(participantes.map(p=>p.id)).size!==participantes.length)falhar('Confira a lista de participantes.');
 const vinculos=participantes.filter(p=>p.rhId).map(p=>p.rhId);
 if(new Set(vinculos).size!==vinculos.length)falhar('A mesma pessoa do RH não pode participar duas vezes.');
 if(!Array.isArray(c.decisoes)||c.decisoes.length>100)falhar('Informe até 100 encaminhamentos.');
 if(c.decisoes.some(d=>!d||typeof d!=='object'))falhar('Confira a lista de decisões.');
 const decisoes=c.decisoes.map(d=>({id:d.id,texto:texto(d.texto,2000,'a decisão',true),responsavel:texto(d.responsavel??'',180,'o responsável pela decisão'),prazo:d.prazo||'',concluida:d.concluida===true}));
 if(decisoes.some(d=>!idValido(d.id)||(d.prazo&&!dataValida(d.prazo)))||new Set(decisoes.map(d=>d.id)).size!==decisoes.length)falhar('Confira os prazos e as decisões.');
 const base={id:c.id,titulo,setor,tipo:c.tipo,data:c.data,inicio:c.inicio,fim:c.fim,local,responsavel,pauta,ata,participantes,decisoes,situacao:c.situacao,
  criadoEm:anterior?.criadoEm||agora,criadoPor:anterior?.criadoPor||s.sub,criadoPorNome:anterior?.criadoPorNome||s.nome||s.sub,
  atualizadoEm:agora,atualizadoPor:s.sub,atualizadoPorNome:s.nome||s.sub,
  anexos:anterior?.anexos||[],registros:anterior?.registros||[],historico:anterior?.historico||[]};
 if(JSON.stringify(base).length>250000)falhar('O encontro ficou muito extenso. Use arquivos para os materiais maiores.');
 return base;
}
export function carimbarReuniao(r,s,acao,agora=new Date().toISOString()){
 if((r.historico||[]).length>=1000)falhar('O encontro atingiu o limite de alterações. Crie um novo registro para continuar.');
 return {...r,versao:crypto.randomUUID(),atualizadoEm:agora,atualizadoPor:s.sub,atualizadoPorNome:s.nome||s.sub,historico:[...(r.historico||[]),{em:agora,por:s.sub,nome:s.nome||s.sub,acao}]};
}
export function novoRegistro(r,conteudo,s){
 const mensagem=texto(conteudo,5000,'o registro',true);
 if((r.registros||[]).length>=200)falhar('Limite de 200 registros atingido.');
 return {...r,registros:[...(r.registros||[]),{id:crypto.randomUUID(),texto:mensagem,em:new Date().toISOString(),por:s.sub,nome:s.nome||s.sub}]};
}
export function validarArquivoReuniao(nome,mime,tamanho){
 const tipos={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
 const n=texto(nome,180,'o nome do arquivo',true),ext=n.split('.').pop().toLowerCase();
 if(!tipos[ext]||tipos[ext]!==mime)falhar('Use PDF, PNG, JPG, WebP, Word, Excel ou PowerPoint (.docx, .xlsx, .pptx).');
 if(!Number.isInteger(tamanho)||tamanho<=0||tamanho>MAX_ARQUIVO_REUNIAO)falhar('Cada arquivo pode ter até 5 MB.',413);
 return {nome:n,mime,ext,tamanho};
}
