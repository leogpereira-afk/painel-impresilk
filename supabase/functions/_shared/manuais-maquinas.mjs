// Conteúdo operacional apenas. Aquisição, valores, credenciais e metadados de
// auditoria nunca entram pela requisição. Os textos são texto simples, não HTML.
export const COLECAO_MANUAIS = 'manuais_maquinas';
export const UUID_MANUAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SECOES_MANUAL = ['finalidade','seguranca','preparacao','operacao','qualidade','encerramento','limpeza','problemas'];
export const LIMITES_MANUAL = {texto:18000,curto:300,lista:80,conteudo:200000};
export function falhaManual(mensagem,status=422){throw Object.assign(new Error(mensagem),{status});}
const objeto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function camposManuais(v,permitidos,rotulo='Conteúdo'){
 if(!objeto(v))falhaManual(`${rotulo} inválido.`);
 if(Object.keys(v).some(k=>!permitidos.includes(k)))falhaManual(`${rotulo}: campo não permitido.`);
}
const segredo=/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sb_secret_|sk_live_)[\w-]+|\beyJ[\w-]{20,}\.[\w-]+\.[\w-]+|\b(?:password|senha|service_role|api[_-]?key|access[_-]?token)\s*[:=]\s*\S+)/i;
function texto(v,max=LIMITES_MANUAL.curto){
 if(v==null)return '';
 if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)||segredo.test(v))falhaManual('Texto inválido, extenso demais ou com credenciais.');
 return v.trim();
}
function booleano(v){if(v===undefined)return false;if(typeof v!=='boolean')falhaManual('Confirmação inválida.');return v;}
function opcao(v,lista,padrao){if(v===undefined)return padrao;if(!lista.includes(v))falhaManual('Opção inválida.');return v;}
function data(v){const d=texto(v,10),instante=new Date(`${d}T00:00:00Z`);if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(instante.getTime())||instante.toISOString().slice(0,10)!==d))falhaManual('Data inválida.');return d;}
function uuid(v,opcional=false){if(opcional&&(v===undefined||v===''))return '';if(typeof v!=='string'||!UUID_MANUAL.test(v))falhaManual('Use um UUID válido nos itens do manual.');return v.toLowerCase();}
export function urlManual(v){
 const s=texto(v,2048);if(!s)return '';
 let u;try{u=new URL(s);}catch{falhaManual('Informe um link HTTPS válido.');}
 const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||!h.includes('.')||/^(?:127|0|10)\.|^192\.168\.|^169\.254\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(h)||h.startsWith('['))falhaManual('Informe um link HTTPS público, sem credenciais.');
 if([...u.searchParams.keys()].some(k=>/^(?:token|access_token|refresh_token|password|senha|api[_-]?key|secret|signature|x-amz-signature)$/i.test(k)))falhaManual('O link não pode conter credenciais ou tokens temporários.');
 // O link original do Drive conserva suas permissões: nenhum proxy ou mudança de ACL.
 return u.href;
}
function lista(v,permitidos,preparar){
 if(v===undefined)return [];
 if(!Array.isArray(v)||v.length>LIMITES_MANUAL.lista)falhaManual('Lista inválida ou extensa demais.');
 const ids=new Set();return v.map(item=>{camposManuais(item,['id',...permitidos],'Item');const id=uuid(item.id);if(ids.has(id))falhaManual('Há IDs repetidos na lista.');ids.add(id);return {id,...preparar(item)};});
}
function prepararFotoManual(v,consumivel=false){
 const foto=v??{};camposManuais(foto,['url','fonteUrl','legenda','usoConfirmado',...(!consumivel?['principal']:[])],'Foto');
 const pronta={url:urlManual(foto.url),fonteUrl:urlManual(foto.fonteUrl),legenda:texto(foto.legenda,1000),usoConfirmado:booleano(foto.usoConfirmado)};
 if(pronta.url&&!pronta.usoConfirmado)falhaManual('Confirme o direito de uso da foto antes de cadastrá-la.');
 if(pronta.url&&consumivel&&!pronta.fonteUrl)falhaManual('Informe a fonte da foto do consumível.');
 if(!consumivel){
  pronta.principal=opcao(foto.principal,['inventario','referencia'],'inventario');
  if(pronta.principal==='referencia'&&!pronta.url)falhaManual('Cadastre uma foto de referência confirmada antes de priorizá-la.');
 }
 return pronta;
}
export function prepararConteudoManual(v){
 camposManuais(v,['identificacaoConfirmada','fabricante','modelo','variante','responsavelId','revisarEm',...SECOES_MANUAL,'consumiveis','fontes','assistencias','treinamentos','foto']);
 if(JSON.stringify(v).length>LIMITES_MANUAL.conteudo)falhaManual('Conteúdo extenso demais.');
 const c={identificacaoConfirmada:booleano(v.identificacaoConfirmada),fabricante:texto(v.fabricante),modelo:texto(v.modelo),variante:texto(v.variante),responsavelId:texto(v.responsavelId,180),revisarEm:data(v.revisarEm)};
 for(const s of SECOES_MANUAL)c[s]=texto(v[s],LIMITES_MANUAL.texto);
 c.fontes=lista(v.fontes,['titulo','url','tipo','modelo','versao','idioma','conferidoEm','pagina','situacao'],s=>({titulo:texto(s.titulo),url:urlManual(s.url),tipo:opcao(s.tipo,['fabricante','interno','video','ficha-seguranca'],'interno'),modelo:texto(s.modelo),versao:texto(s.versao),idioma:texto(s.idioma),conferidoEm:data(s.conferidoEm),pagina:texto(s.pagina),situacao:opcao(s.situacao,['verificado','pendente'],'pendente')}));
 c.consumiveis=lista(v.consumiveis,['nome','codigo','uso','compatibilidade','armazenamento','fonteId','foto'],s=>({nome:texto(s.nome),codigo:texto(s.codigo),uso:texto(s.uso,3000),compatibilidade:opcao(s.compatibilidade,['fabricante','uso-interno','pendente'],'pendente'),armazenamento:texto(s.armazenamento,3000),fonteId:uuid(s.fonteId,true),foto:prepararFotoManual(s.foto,true)}));
 for(const item of c.consumiveis){if(item.fonteId&&!c.fontes.some(f=>f.id===item.fonteId))falhaManual('A fonte do consumível não existe neste manual.');if(item.compatibilidade==='fabricante'&&!c.fontes.some(f=>f.id===item.fonteId&&f.tipo==='fabricante'&&f.situacao==='verificado'&&f.url&&f.conferidoEm&&c.modelo&&f.modelo.toLocaleLowerCase('pt-BR')===c.modelo.toLocaleLowerCase('pt-BR')))falhaManual('Compatibilidade do fabricante exige fonte verificada para este modelo, com link e data de conferência.');}
 c.assistencias=lista(v.assistencias,['nome','especialidade','telefone','whatsapp','email','endereco','url','conferidoEm'],s=>{
  const email=texto(s.email);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))falhaManual('E-mail inválido.');
  const telefone=texto(s.telefone,60),whatsapp=texto(s.whatsapp,30);if(telefone&&!/^[\d\s()+.\-]+$/.test(telefone)||whatsapp&&!/^\+?[\d\s()\-]+$/.test(whatsapp))falhaManual('Telefone inválido.');
  return {nome:texto(s.nome),especialidade:texto(s.especialidade),telefone,whatsapp,email,endereco:texto(s.endereco,1000),url:urlManual(s.url),conferidoEm:data(s.conferidoEm)};
 });
 c.treinamentos=lista(v.treinamentos,['titulo','objetivo','conteudo','criterio','url'],s=>({titulo:texto(s.titulo),objetivo:texto(s.objetivo,3000),conteudo:texto(s.conteudo,6000),criterio:texto(s.criterio,3000),url:urlManual(s.url)}));
 c.foto=prepararFotoManual(v.foto);
 return c;
}
export function validarReferenciaManual(ref){
 camposManuais(ref,['tipo','id'],'Referência');
 // IDs legados pat-… e maquina-… são aceitos; existência/tipo são conferidos no banco.
 if(!['ativo','bem'].includes(ref.tipo)||typeof ref.id!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(ref.id))falhaManual('Referência de máquina inválida.');
 return {tipo:ref.tipo,id:ref.id};
}
export const chaveReferenciaManual=r=>`${r.tipo}:${r.id}`;
export function resolverReferenciaManual(ref,ativos,bens){
 validarReferenciaManual(ref);
 const base=(ref.tipo==='ativo'?ativos:bens).get(ref.id);
 if(!base)falhaManual('Máquina não encontrada.',404);
 if(ref.tipo==='ativo'&&base.tipo!=='maquina')falhaManual('A referência não pertence a uma máquina.');
 const aids=new Set(ref.tipo==='ativo'?[ref.id]:[]),bids=new Set(ref.tipo==='bem'?[ref.id]:[]);
 if(ref.tipo==='ativo'){
  if(base.bemId)bids.add(base.bemId);
  for(const [id,b] of bens)if(b.origemAtivoId===ref.id)bids.add(id);
 }else{
  if(base.origemAtivoId)aids.add(base.origemAtivoId);
  for(const [id,a] of ativos)if(a.bemId===ref.id)aids.add(id);
 }
 for(const id of aids){const a=ativos.get(id);if(!a||a.tipo!=='maquina')falhaManual('O vínculo da máquina está inconsistente.',409);if(a.bemId)bids.add(a.bemId);for(const [bid,b] of bens)if(b.origemAtivoId===id)bids.add(bid);}
 for(const id of bids){const b=bens.get(id);if(!b)falhaManual('O vínculo do bem está inconsistente.',409);if(b.origemAtivoId)aids.add(b.origemAtivoId);for(const [aid,a] of ativos)if(a.bemId===id)aids.add(aid);}
 if(aids.size>1||bids.size>1)falhaManual('Há vínculos conflitantes entre a máquina e o inventário.',409);
 for(const id of aids)if(ativos.get(id)?.tipo!=='maquina')falhaManual('O vínculo da máquina está inconsistente.',409);
 // A área organiza bens sem ficha. Quando há ficha ligada, seu tipo é a
 // classificação vigente (o patrimônio permite inclusive área vazia legada).
 if(!aids.size&&base.areaPatrimonio!=='maquinas')falhaManual('A referência não pertence a uma máquina.');
 const referencias=[...aids].map(id=>({tipo:'ativo',id})).concat([...bids].map(id=>({tipo:'bem',id})));
 return {referencia:referencias[0],referencias};
}
// Catálogo de operação independente do inventário financeiro. Um bem sem
// ficha pode ter manual e QR mesmo para quem não acessa aquisição/valores.
export function catalogoMaquinasManual(ativos,bens,setores=new Map()){
 const texto=v=>typeof v==='string'?v.trim().slice(0,1000):'';
 const setorDe=b=>texto(setores.get(b?.setorSigla)?.nome)||texto(b?.setorSigla);
 const ligados=new Set([...ativos.values()].map(a=>a.bemId).filter(Boolean));
 const itens=[];
 for(const [id,a] of ativos){
  if(a?.tipo!=='maquina')continue;
  let bem=null,conflito=false;
  try{const r=resolverReferenciaManual({tipo:'ativo',id},ativos,bens);const ref=r.referencias.find(x=>x.tipo==='bem');if(ref)bem={...bens.get(ref.id),id:ref.id};}
  catch(e){if(e.status!==409)throw e;conflito=true;}
  itens.push({id,tipo:'maquina',nome:texto(a.nome),codigo:texto(bem?.codigo),modelo:[texto(a.especificacao?.fabricante),texto(a.especificacao?.modelo)].filter(Boolean).join(' · '),identificacao:texto(a.especificacao?.numeroSerie),setor:setorDe(bem)||texto(a.especificacao?.setor),categoria:texto(a.categoria),somenteBem:false,...(bem?{bem:{id:bem.id}}:{}),...(conflito?{conflitoVinculo:true}:{})});
 }
 for(const [id,b] of bens){
  // Origem órfã, ficha oculta ou conflito nunca viram um segundo equipamento.
  if(b?.areaPatrimonio!=='maquinas'||b.situacao==='baixado'||b.origemAtivoId||ligados.has(id))continue;
  validarReferenciaManual({tipo:'bem',id});
  itens.push({id:`bem:${id}`,tipo:'maquina',nome:texto(b.descricaoTecnica)||texto(b.nomeGenerico),codigo:texto(b.codigo),modelo:'',identificacao:'',setor:setorDe(b),categoria:'',somenteBem:true,bem:{id}});
 }
 return itens.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true})||a.id.localeCompare(b.id));
}
export function validarAprovacaoManual(c,pessoas){
 if(!c.identificacaoConfirmada||!c.fabricante||!c.modelo)falhaManual('Confirme fabricante e modelo antes de aprovar.');
 if(!c.seguranca||!c.operacao)falhaManual('A aprovação exige segurança e operação preenchidas.');
 if(!c.responsavelId||!pessoas.some(p=>p.id===c.responsavelId&&p.disponivel))falhaManual('A aprovação exige responsável ativo no RH.');
 if(!c.revisarEm)falhaManual('Informe a data de revisão antes de aprovar.');
 const modelo=c.modelo.trim().toLocaleLowerCase('pt-BR');
 if(!c.fontes.some(f=>f.url&&f.titulo&&f.situacao==='verificado'&&f.conferidoEm&&f.modelo.trim().toLocaleLowerCase('pt-BR')===modelo))falhaManual('A aprovação exige fonte verificada para este modelo, com link e data de conferência.');
}
export function snapshotManual(m){const {historico:_,...snapshot}=m;return snapshot;}
export function manualVisivel(m,gestor){
 if(!m)return null;
 if(gestor)return m;
 const publicado=m.estado==='aprovado'?m:[...(m.historico||[])].reverse().find(v=>v.estado==='aprovado');
 if(!publicado)return null;
 // Projeção fechada também para snapshots: nenhuma extensão futura ou log vaza.
 const campos=['id','referencia','referencias','conteudo','estado','revisao','criadoEm','atualizadoEm','aprovadoEm','responsavel','responsavelIdPessoa'];
 return {...Object.fromEntries(campos.filter(k=>Object.hasOwn(publicado,k)).map(k=>[k,publicado[k]])),...(Array.isArray(m.referencias)?{referencias:m.referencias}:{})};
}
