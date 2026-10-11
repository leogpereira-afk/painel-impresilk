// O login continua sendo a chave de acesso à agenda. A identidade é a ficha
// já vinculada em acesso_conta.colaborador_id; nunca inferida pelo nome.
const texto = v => String(v ?? '').trim();
const falhar = (mensagem,status=422) => { throw Object.assign(new Error(mensagem),{status}); };
const fotoSegura = v => typeof v==='string' && v.length<=300000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : '';
async function paginas(consulta) {
 const linhas=[];
 for(let de=0;;de+=500) {
  const {data,error}=await consulta().range(de,de+499);
  if(error)falhar('Não foi possível conferir os vínculos com o RH. Atualize a agenda e tente novamente.',503);
  linhas.push(...data||[]);if((data||[]).length<500)return linhas;
 }
}

export async function lerEquipeCompromissos(sb,{masterUsuario='',rhIds=[]}={}) {
 const [painel,contas,papeis]=await Promise.all([
  paginas(()=>sb.from('painel_contas').select('usuario,nome,permissoes').order('usuario')),
  paginas(()=>sb.from('acesso_conta').select('id,usuario,colaborador_id,id_pessoa,ativo').order('id')),
  paginas(()=>sb.from('acesso_papel').select('conta_id,login,ativo').eq('sistema','painel').order('conta_id')),
 ]);
 const permitidas=painel.filter(p=>Array.isArray(p.permissoes)&&(p.permissoes.includes('*')||p.permissoes.includes('compromissos')));
 if(masterUsuario&&!permitidas.some(p=>p.usuario===masterUsuario))permitidas.push({usuario:masterUsuario,nome:'Direção'});
 const candidatos=permitidas.map(p=>{
  const ligados=contas.filter(c=>c.usuario===p.usuario||papeis.some(r=>r.login===p.usuario&&r.conta_id===c.id));
  const unica=ligados.length===1?ligados[0]:null;
  const papel=unica?papeis.filter(r=>r.conta_id===unica.id):[];
  return {usuario:p.usuario,nome:p.nome||p.usuario,rhId:unica?texto(unica.colaborador_id):'',rhCodigo:unica?texto(unica.id_pessoa):'',
   ativo:!!unica&&unica.ativo!==false&&!papel.some(r=>r.ativo===false),ambiguo:ligados.length>1};
 });
 const ids=[...new Set([...candidatos.map(p=>p.rhId),...rhIds].map(texto).filter(Boolean))];
 const porRh=new Map();
 for(let i=0;i<ids.length;i+=100) {
  const lote=ids.slice(i,i+100);
  const linhas=await paginas(()=>sb.from('registros')
   .select('id,nome:registro->>nome,statusId:registro->>statusId,saiu:registro->>dataDesligamento,fotoDataUrl:registro->>fotoDataUrl')
   .eq('colecao','colaboradores').eq('apagado',false).in('id',lote).order('id'));
  for(const r of linhas) {
   const id=texto(r.id),nome=texto(r.nome);if(!id||!nome)continue;
   if(porRh.has(id))falhar('Há fichas duplicadas no RH. Confira o vínculo antes de encaminhar.');
   const codigos=[...new Set(candidatos.filter(p=>p.rhId===id).map(p=>p.rhCodigo).filter(Boolean))];
   porRh.set(id,{id,nome,codigo:codigos.length===1?codigos[0]:'',fotoDataUrl:fotoSegura(r.fotoDataUrl),ativo:r.statusId!=='inativo'&&!r.saiu});
  }
 }
 const pessoas=candidatos.map(p=>{
  const rh=porRh.get(p.rhId),disponivel=!!rh&&p.ativo&&rh.ativo;
  return {usuario:p.usuario,nome:rh?.nome||p.nome,rhId:p.rhId,rhCodigo:rh?.codigo||'',fotoDataUrl:rh?.fotoDataUrl||'',disponivel,
   vinculo:p.ambiguo?'ambiguo':!p.rhId?'sem-vinculo':!rh?'ausente':!disponivel?'indisponivel':'vinculado'};
 }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.usuario.localeCompare(b.usuario));
 return {pessoas,porRh};
}

export function enriquecerCompromissosRH(mapa,diretorio) {
 return Object.fromEntries(Object.entries(mapa).map(([id,c])=>{
  const acesso=diretorio.pessoas.find(p=>p.usuario===c.dono);
  const gravado=texto(c.donoRhId),rhId=gravado||acesso?.rhId||'',rh=diretorio.porRh.get(rhId);
  const divergente=gravado&&acesso?.rhId&&gravado!==acesso.rhId;
  const vinculo=divergente?'divergente':!rhId?(acesso?.vinculo||'sem-vinculo'):!rh?'ausente':
   !rh.ativo||!acesso?.disponivel?'indisponivel':gravado?'vinculado':'central';
  return [id,{...c,donoRhId:rhId,donoRH:{id:rhId,codigo:rh?.codigo||'',nome:rh?.nome||c.donoNome||c.dono||'Responsável não informado',fotoDataUrl:rh?.fotoDataUrl||'',vinculo}}];
 }));
}

export function autorCompromissoRH(sessao,diretorio) {
 const pessoa=diretorio.pessoas.find(p=>p.usuario===sessao?.sub);
 return {quem:texto(sessao?.sub),quemNome:pessoa?.nome||sessao?.nome||texto(sessao?.sub),
  ...(pessoa?.rhId&&pessoa.vinculo!=='ambiguo'?{quemRhId:pessoa.rhId,...(pessoa.rhCodigo?{quemRhCodigo:pessoa.rhCodigo}:{})}:{})};
}

export function prepararCompromissoRH(campos,anterior,sessao,diretorio,agora) {
 const limpos={...campos};
 for(const chave of ['historico','donoRhId','donoRH','destinoRhId','encaminhadoPor','encaminhadoEm','recado'])delete limpos[chave];
 const novo={...anterior,...limpos};delete novo.donoRH;
 const eu=texto(sessao?.sub),pedido=texto(campos.dono);
 const mudou=!!pedido&&pedido!==anterior?.dono;
 const usuario=mudou?pedido:anterior?.dono||eu;
 const destino=diretorio.pessoas.find(p=>p.usuario===usuario);
 if(!anterior||mudou) {
  if(!destino?.disponivel)falhar('O responsável precisa ter acesso a Compromissos e um vínculo ativo com a ficha do RH. Confira em Sistemas de acessos.');
  if(campos.destinoRhId&&campos.destinoRhId!==destino.rhId)falhar('O vínculo desta pessoa mudou. Atualize a agenda antes de encaminhar.',409);
 }
 novo.dono=usuario;
 novo.donoRhId=mudou||!anterior?destino.rhId:anterior.donoRhId||destino?.rhId||'';
 novo.donoNome=mudou||!anterior?destino.nome:anterior.donoNome||destino?.nome||usuario;
 const base={em:agora,...autorCompromissoRH(sessao,diretorio)};
 const historico=Array.isArray(anterior?.historico)?anterior.historico:[];
 if(mudou&&anterior) {
  const origem=diretorio.pessoas.find(p=>p.usuario===anterior.dono);
  const deRhId=anterior.donoRhId||origem?.rhId||'';
  novo.encaminhadoPor=base.quemNome;novo.encaminhadoEm=agora;
  novo.historico=[...historico,{...base,tipo:'passou',para:usuario,paraNome:destino.nome,paraRhId:destino.rhId,...(destino.rhCodigo?{paraRhCodigo:destino.rhCodigo}:{}),
   ...(deRhId?{deRhId}:{}),texto:texto(campos.recado).slice(0,2000)||undefined}].slice(-200);
 }else if(!anterior)novo.historico=[{...base,tipo:'criou'}];
 else if(campos.feito!==undefined&&!!campos.feito!==!!anterior.feito)novo.historico=[...historico,{...base,tipo:campos.feito?'concluiu':'reabriu'}].slice(-200);
 return novo;
}
