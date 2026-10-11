const CATEGORIAS = {
  informatica: ['Telefone','Central telefônica','Celular','Computador','Notebook','Servidor','Rede','Rede e internet'],
  seguranca: ['Câmera','Câmeras / CFTV','DVR/NVR','Alarme','Chave','Portão','Portão / automatizador','Acesso facial','Relógio de ponto'],
  predial: ['Extintor','AVCB','Iluminação de emergência','Sinalização de segurança','Padrão de energia','Transformador','Usina fotovoltaica'],
};
const COMUNS = ['local','marcaModelo','fabricante','modelo','numeroSerie','setorId','situacao'];
const CAMPOS = {
  informatica: [...COMUNS,'imei','processador','memoria','armazenamento','quantidade','instalacao','rede','enderecoIP','backup','tecnicoId'],
  seguranca: [...COMUNS,'numero','posicao','ambiente','gravadorId','canal','canaisTotais','diasGravacao','empresaMonitoramento','contatoMonitoramento','tipoPortao','automatizador','libera','zonas','sensores','autorizados','copias'],
  predial: ['local','setorId','numero','tipoExtintor','capacidade','instalacao','situacao','testeAutonomiaMinutos','tipoSinalizacao','endereco','unidadeConsumidora','tensao','potencia','kva','potenciaInstalada','placas','inversores','unidadesConsumidoras','tecnicoId'],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const falhar = (msg, status=422) => { throw Object.assign(new Error(msg),{status}); };
const texto = (v,n,max=180) => { if(typeof v!=='string') falhar(`${n} inválido.`);const s=v.trim();if(s.length>max)falhar(`${n} ultrapassa ${max} caracteres.`);return s; };
const data = (v,n) => {const s=texto(v,n,10);if(s && (!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s))falhar(`${n} inválida.`);return s;};
const objeto = (v,n) => {if(!v||typeof v!=='object'||Array.isArray(v))falhar(`${n} inválido.`);return v;};
const mesmosItens = (a,b) => {
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
  const contagens=new Map();
  for(const id of a)contagens.set(id,(contagens.get(id)||0)+1);
  for(const id of b){const restante=contagens.get(id);if(!restante)return false;contagens.set(id,restante-1);}
  return true;
};
function lista(v,campos,n,anterior=[]) {
  if(!Array.isArray(v)||v.length>200)falhar(`${n} inválido.`);
  const ids=new Set();
  const saida=v.map(x=>{objeto(x,n);if(!UUID.test(x.id)||ids.has(x.id))falhar(`${n}: ID inválido ou repetido.`);ids.add(x.id);
    for(const k of Object.keys(x))if(!campos.includes(k))falhar(`${n}: campo ${k} não permitido.`);
    return Object.fromEntries(campos.map(k=>[k,k.endsWith('Em')||['entrega','devolucao'].includes(k)?data(x[k]??'',k):texto(x[k]??'',k,180)]));
  });
  for(const x of saida){
    if((x.entrega||x.liberadoEm)&&!x.pessoaId&&!(anterior||[]).some(old=>old.id===x.id&&(old.entrega||old.liberadoEm)&&!old.pessoaId))falhar(`${n}: selecione a pessoa do RH.`);
    if(x.devolucao&&(!x.entrega||x.devolucao<x.entrega))falhar(`${n}: devolução anterior à entrega.`);
    if(x.bloqueadoEm&&(!x.liberadoEm||x.bloqueadoEm<x.liberadoEm))falhar(`${n}: bloqueio anterior à liberação.`);
  }
  // Posse/liberação iniciada é história. Só a data de encerramento pode ser adicionada.
  for(const old of anterior||[])if(old.entrega||old.liberadoEm||old.devolucao||old.bloqueadoEm){
    const x=saida.find(x=>x.id===old.id);
    if(!x||Object.keys(old).some(k=>x[k]!==old[k]&&!(k==='devolucao'&&!old.devolucao&&!!x.devolucao)&&!(k==='bloqueadoEm'&&!old.bloqueadoEm&&!!x.bloqueadoEm)))falhar(`${n}: entrega ou liberação não pode ser alterada ou removida.`);
  }
  return saida;
}
export function prepararFisico(item,anterior,refs={}) {
  objeto(item,'Item');
  const tipo=item.tipo??anterior?.tipo;
  const categoria=item.categoria??anterior?.categoria;
  if(!Object.hasOwn(CATEGORIAS,tipo)||!CATEGORIAS[tipo].includes(categoria))falhar('Tipo ou categoria inválida.');
  if(anterior&&(anterior.tipo!==tipo||anterior.categoria!==categoria))falhar('Tipo e categoria não podem mudar.');
  for(const k of Object.keys(item))if(!['id','cadastroId','tipo','categoria','nome','identificacao','responsavelId','especificacao','bemId','validade'].includes(k))falhar(`Campo ${k} não permitido.`);
  if(Object.hasOwn(item,'bemId')&&item.bemId!==(anterior?.bemId||'')) {if(!refs.inventario)falhar('Vínculo com inventário exige Inventário e valores.',403);if(item.bemId&&!refs.bem)falhar('Bem do inventário inválido.',409);}
  const prev=anterior?.especificacao||{};
  const patch=item.especificacao===undefined?{}:objeto(item.especificacao,'Especificação');
  for(const k of Object.keys(patch))if(!CAMPOS[tipo].includes(k))falhar(`Campo ${k} não permitido na especificação.`);
  if(patch.tecnicoId&&patch.tecnicoId!==prev.tecnicoId&&(!UUID.test(patch.tecnicoId)||typeof patch.tecnicoId!=='string'))falhar('Selecione um contato técnico cadastrado.',409);
  const porCategoria={
    'Câmera':['numero','posicao','ambiente','gravadorId','canal'],'Câmeras / CFTV':['numero','posicao','ambiente','gravadorId','canal'],
    'DVR/NVR':['canaisTotais','diasGravacao'],'Alarme':['empresaMonitoramento','contatoMonitoramento','zonas','sensores','autorizados'],
    'Chave':['copias'],'Portão':['tipoPortao','automatizador','copias'],'Portão / automatizador':['tipoPortao','automatizador','copias'],
    'Acesso facial':['libera','autorizados'],'Extintor':['numero','tipoExtintor','capacidade'],
    'Iluminação de emergência':['numero','testeAutonomiaMinutos'],'Sinalização de segurança':['numero','tipoSinalizacao'],
    'Padrão de energia':['endereco','unidadeConsumidora','tensao','potencia','tecnicoId'],
    'Transformador':['endereco','kva','tecnicoId'],
    'Usina fotovoltaica':['endereco','potenciaInstalada','placas','inversores','unidadesConsumidoras','tecnicoId'],
    'Computador':['rede','enderecoIP','backup','tecnicoId'],
    'Notebook':['rede','enderecoIP','backup','tecnicoId'],
    'Servidor':['rede','enderecoIP','backup','tecnicoId'],
  };
  const especificos=['numero','posicao','ambiente','gravadorId','canal','canaisTotais','diasGravacao','empresaMonitoramento','contatoMonitoramento','tipoPortao','automatizador','libera','zonas','sensores','autorizados','copias','tipoExtintor','capacidade','testeAutonomiaMinutos','tipoSinalizacao','endereco','unidadeConsumidora','tensao','potencia','kva','potenciaInstalada','placas','inversores','unidadesConsumidoras','rede','enderecoIP','backup','tecnicoId'];
  for(const [k,v] of Object.entries(patch))if(especificos.includes(k)&&!porCategoria[categoria]?.includes(k)&&(Array.isArray(v)?v.length>0:!!v))falhar(`${k} não pertence a ${categoria}.`);
  const ficha={...prev};
  for(const [k,v] of Object.entries(patch)) {
    if(['zonas','sensores','autorizados','copias','unidadesConsumidoras'].includes(k))continue;
    ficha[k]=k==='instalacao'?data(v,k):v===prev[k]?v:texto(v,k,180);
  }
  for(const [campo,limite] of [['canal',1024],['canaisTotais',1024],['diasGravacao',3650],['testeAutonomiaMinutos',10000]]){
    if(ficha[campo]&&!new RegExp(`^[1-9]\\d{0,${String(limite).length-1}}$`).test(ficha[campo]))falhar(`${campo}: informe um inteiro positivo.`);
    if(ficha[campo]&&Number(ficha[campo])>limite)falhar(`${campo}: valor acima do limite.`);
  }
  if(ficha.situacao&&!['uso','reserva','conserto','baixado'].includes(ficha.situacao))falhar('Situação inválida.');
  if(ficha.ambiente&&!['interna','externa'].includes(ficha.ambiente))falhar('Ambiente inválido.');
  if(ficha.setorId&&ficha.setorId!==prev.setorId&&(!refs.setor||!refs.setorId||refs.setorId!==ficha.setorId))falhar('Selecione um setor cadastrado.',409);
  if(ficha.tecnicoId&&ficha.tecnicoId!==prev.tecnicoId&&(!UUID.test(ficha.tecnicoId)||refs.tecnico!==true))falhar('Selecione um contato técnico cadastrado.',409);
  let unidadesIntactas=!Object.hasOwn(patch,'unidadesConsumidoras');
  if(Object.hasOwn(patch,'unidadesConsumidoras')){
    if(!Array.isArray(patch.unidadesConsumidoras)||patch.unidadesConsumidoras.length>200)falhar('Unidades consumidoras inválidas.');
    const antigas=prev.unidadesConsumidoras;
    unidadesIntactas=mesmosItens(antigas,patch.unidadesConsumidoras);
    if(!unidadesIntactas&&(new Set(patch.unidadesConsumidoras).size!==patch.unidadesConsumidoras.length||patch.unidadesConsumidoras.some(x=>typeof x!=='string'||!UUID.test(x))))falhar('Unidades consumidoras inválidas.');
    ficha.unidadesConsumidoras=unidadesIntactas?[...antigas]:[...patch.unidadesConsumidoras];
  }
  if(!unidadesIntactas&&Array.isArray(ficha.unidadesConsumidoras)&&ficha.unidadesConsumidoras.some(x=>!refs.unidadesConsumidoras?.includes(x)))falhar('Selecione padrões de energia cadastrados.',409);
  if(ficha.gravadorId&&ficha.gravadorId!==prev.gravadorId&&(!refs.gravador||refs.gravadorId!==ficha.gravadorId||refs.gravador.tipo!=='seguranca'||refs.gravador.categoria!=='DVR/NVR'||refs.gravador.especificacao?.situacao==='baixado'))falhar('Selecione um DVR/NVR cadastrado.',409);
  if(categoria==='Câmera'||categoria==='Câmeras / CFTV'){
    const total=Number(refs.gravador?.especificacao?.canaisTotais||0),canal=Number(ficha.canal||0);
    if(ficha.gravadorId&&canal&&total&&canal>total)falhar('Canal acima da capacidade do gravador.',409);
    if(ficha.gravadorId&&canal&&refs.ocupadoCanal)falhar('Este canal já está ocupado no gravador.',409);
  }
  if(tipo==='seguranca') {
    const permitidas=categoria==='Alarme'?['zonas','sensores','autorizados']:categoria==='Acesso facial'?['autorizados']:categoria==='Chave'||categoria.startsWith('Portão')?['copias']:[];
    for(const k of ['zonas','sensores','autorizados','copias'])if(Object.hasOwn(patch,k)&&!permitidas.includes(k))falhar(`${k} não pertence a esta categoria.`);
    const shapes={zonas:['id','nome','local'],sensores:['id','nome','local','zonaId'],autorizados:['id','pessoaId','liberadoEm','bloqueadoEm'],copias:['id','numero','pessoaId','entrega','devolucao','tipo']};
    for(const k of permitidas)if(Object.hasOwn(patch,k))ficha[k]=lista(patch[k],shapes[k],k,prev[k]);
    if(ficha.sensores?.some(s=>s.zonaId&&!ficha.zonas?.some(z=>z.id===s.zonaId)))falhar('Sensor aponta para zona inexistente.');
    for(const k of ['autorizados','copias'])for(const x of ficha[k]||[])if(x.pessoaId&&!refs.pessoas?.some(p=>p.id===x.pessoaId&&(p.disponivel||prev[k]?.some(y=>y.id===x.id&&y.pessoaId===x.pessoaId))))falhar('Selecione uma pessoa do RH.');
    if(ficha.copias?.some(x=>x.tipo&&!['chave','controle','tag'].includes(x.tipo)))falhar('Tipo de cópia inválido.');
  }
  const nome=texto(item.nome??anterior?.nome??'','Nome');if(!nome)falhar('Informe o nome.');
  const out={nome,tipo,categoria,identificacao:texto(item.identificacao??anterior?.identificacao??'','Identificação',120),especificacao:ficha};
  if(tipo==='predial')out.validade=data(item.validade??anterior?.validade??'','Validade');
  return out;
}
export function prepararConferencia(dados,anterior,cameras,sessao,agora){
  objeto(dados,'Conferência');
  for(const k of Object.keys(dados))if(!['data','itens','versaoAnterior'].includes(k))falhar(`Campo ${k} não permitido.`);
  if(anterior)falhar('Conferência concluída é imutável.',409);
  const dia=data(dados.data,'Data');if(!dia)falhar('Informe a data.');
  if(!Array.isArray(dados.itens)||dados.itens.length!==cameras.length)falhar('Confira todas as câmeras ativas.');
  const ids=new Set();
  const itens=dados.itens.map(x=>{objeto(x,'Câmera');if(Object.keys(x).some(k=>!['cameraId','status'].includes(k))||!cameras.includes(x.cameraId)||ids.has(x.cameraId)||!['gravando','sem-imagem','fora-posicao'].includes(x.status))falhar('Checklist de câmeras inválido.');ids.add(x.cameraId);return {cameraId:x.cameraId,status:x.status};});
  return {data:dia,itens,criadoEm:agora,criadoPor:String(sessao.sub),criadoPorNome:String(sessao.nome||sessao.sub)};
}
