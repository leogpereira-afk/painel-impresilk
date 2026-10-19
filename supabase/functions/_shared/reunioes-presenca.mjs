import {ErroReuniao,carimbarReuniao,podeEditarReuniao,idValido} from './reunioes.mjs';

// Apenas o vínculo cadastrado da conta identifica a pessoa. Nunca compara nomes.
export async function identidadePresenca(sb,usuario){
 const semVinculo={rhId:null,motivo:'Sua conta precisa estar vinculada à sua ficha do RH. Peça ao responsável para conferir o vínculo ou registrar sua presença.'};
 try{
  const literal=usuario.replace(/[\\%_]/g,c=>`\\${c}`);
  const [direta,papeis]=await Promise.all([
   sb.from('acesso_conta').select('id,ativo,colaborador_id').ilike('usuario',literal).limit(3),
   sb.from('acesso_papel').select('conta_id,ativo').eq('sistema','painel').ilike('login',literal).limit(3),
  ]);
  if(direta.error||papeis.error)throw new Error('consulta');
  const contas=direta.data||[],aliases=papeis.data||[];
  const ids=new Set([...contas.map(c=>c.id),...aliases.map(p=>p.conta_id)]);
  if(contas.length>1||aliases.length>1||ids.size>1||ids.has(null)||ids.has(undefined))return {...semVinculo,motivo:'Há mais de um vínculo para este login. Peça ao responsável para conferir sua conta.'};
  if(aliases.some(p=>p.ativo===false))return {...semVinculo,motivo:'Seu acesso está desativado. Peça ao responsável para conferir sua conta.'};
  if(!ids.size)return semVinculo;
  let conta=contas[0];
  if(!conta){const r=await sb.from('acesso_conta').select('id,ativo,colaborador_id').eq('id',[...ids][0]).maybeSingle();if(r.error)throw new Error('consulta');conta=r.data;}
  if(!conta||conta.ativo===false||!idValido(conta.colaborador_id))return semVinculo;
  return {rhId:conta.colaborador_id,motivo:''};
 }catch{return {rhId:null,motivo:'Não foi possível conferir seu vínculo agora. Atualize os dados e tente novamente.',indisponivel:true};}
}

export function minhaPresenca(r,identidade){
 const participantes=identidade.rhId?(r.participantes||[]).filter(p=>p.rhId===identidade.rhId):[];
 const p=participantes.length===1?participantes[0]:null;
 return {participanteId:p?.id||null,presenca:p?.presenca||null,podeConfirmar:!!p&&r.situacao!=='cancelado'&&p.presenca!=='presente',
  motivo:r.situacao==='cancelado'?'Este encontro foi cancelado.':p?'':identidade.motivo||'Sua ficha do RH não está vinculada à lista deste encontro. Peça ao responsável para conferir os participantes.'};
}

export function confirmarPresenca(r,s,identidade,pedido){
 if(r.situacao==='cancelado')throw new ErroReuniao('Não é possível confirmar presença em um encontro cancelado.');
 const peloResponsavel=pedido.participanteId!==undefined;
 if(peloResponsavel&&!podeEditarReuniao(r,s))throw new ErroReuniao('Você só pode confirmar a própria presença.',403);
 const minha=minhaPresenca(r,identidade);
 if(!peloResponsavel&&!minha.participanteId)throw new ErroReuniao(minha.motivo,identidade.indisponivel?503:403);
 const id=peloResponsavel?pedido.participanteId:minha.participanteId;
 const pessoa=r.participantes.find(p=>p.id===id);
 if(!pessoa)throw new ErroReuniao('Participante não encontrado neste encontro.',404);
 if(pessoa.presenca==='presente')return r; // Repetir após perda de rede não duplica o histórico.
 if(!['pendente','ausente','justificada'].includes(pedido.presencaAnterior)||pedido.presencaAnterior!==pessoa.presenca)throw new ErroReuniao('A presença desta pessoa mudou. Atualize os dados antes de confirmar.',409);
 const participantes=r.participantes.map(p=>p.id===id?{...p,presenca:'presente'}:p);
 return carimbarReuniao({...r,participantes},s,peloResponsavel?`Registrou a presença de ${pessoa.nome}`:'Confirmou a própria presença');
}

export function periodoAvisos(agora=new Date()){
 const hoje=agora.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 const limite=new Date(hoje+'T12:00:00Z');limite.setUTCDate(limite.getUTCDate()+7);
 return {hoje,ate:limite.toISOString().slice(0,10),hora:agora.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})};
}

// Projeção do aviso: não envia ata, anexos, histórico nem identificação de outros convidados.
export function avisosReunioes(itens,identidade,agora=new Date()){
 const {hoje,ate,hora}=periodoAvisos(agora);
 if(!identidade.rhId)return [];
 return itens.flatMap(r=>{
  if(r.situacao!=='agendado'||r.data<hoje||r.data>ate)return [];
  const meus=(r.participantes||[]).filter(p=>p.rhId===identidade.rhId);
  if(meus.length!==1)return [];
  const pendente=meus[0].presenca==='pendente',passou=r.data===hoje&&r.fim<=hora;
  if(passou&&!pendente)return [];
  const emAndamento=r.data===hoje&&r.inicio<=hora&&!passou;
  return [{id:r.id,titulo:r.titulo,tipo:r.tipo,data:r.data,inicio:r.inicio,fim:r.fim,local:r.local,pendente,
   quando:passou?'Presença pendente de hoje':emAndamento?'Em andamento':r.data===hoje?'Hoje':r.data.split('-').reverse().join('/')}];
 }).sort((a,b)=>a.data.localeCompare(b.data)||a.inicio.localeCompare(b.inicio)||a.id.localeCompare(b.id));
}
