// Cadastro operacional separado do inventário financeiro e dos ativos físicos.
export const UUID_INFRA = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPOS = {
  contato: ['nome','telefone','whatsapp','email','endereco'],
  internet: ['operadora','plano','download','upload','valorMensal','inicioVigencia','fimVigencia','endereco','tecnicoId'],
  'plano-corporativo': ['operadora','nome','valorMensal','quantidadeLinhas','franquia','inicioVigencia','fimVigencia','contatoId'],
};
const falhar=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
const texto=(valor,campo,max=180)=>{
  if(typeof valor!=='string')falhar(`${campo} inválido.`);
  const s=valor.trim();if(s.length>max)falhar(`${campo} ultrapassa ${max} caracteres.`);return s;
};
const data=(valor,campo)=>{
  const s=texto(valor,campo,10);
  if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(`${s}T00:00:00Z`))||new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)!==s))falhar(`${campo} inválida.`);
  return s;
};
export function prepararInfra(dados,anterior,referencias={},sessao={},agora=new Date().toISOString()){
  if(!dados||typeof dados!=='object'||Array.isArray(dados))falhar('Cadastro inválido.');
  const tipo=dados.tipo??anterior?.tipo;
  if(!Object.hasOwn(CAMPOS,tipo)||anterior&&anterior.tipo!==tipo)falhar('Tipo de infraestrutura inválido.');
  const permitidos=['tipo',...CAMPOS[tipo]];
  for(const k of Object.keys(dados))if(!permitidos.includes(k))falhar(`Campo ${k} não permitido.`);
  for(const campo of ['tecnicoId','contatoId'])if(dados[campo]&&dados[campo]!==anterior?.[campo]&&(!UUID_INFRA.test(dados[campo])||typeof dados[campo]!=='string'))falhar(`Selecione um contato cadastrado para ${campo}.`,409);
  const registro={tipo};
  for(const campo of CAMPOS[tipo]){
    const valor=Object.hasOwn(dados,campo)?(dados[campo]??''):(anterior?.[campo]??'');
    if(['valorMensal'].includes(campo)){
      if(valor===''||valor===null){registro[campo]='';continue;}
      if(typeof valor!=='number'||!Number.isFinite(valor)||valor<0||valor>1e9||Math.abs(Math.round(valor*100)-valor*100)>1e-7)falhar(`${campo} inválido.`);
      registro[campo]=valor;
    }else if(campo==='quantidadeLinhas'){
      if(valor===''||valor===null){registro[campo]='';continue;}
      if(!Number.isSafeInteger(valor)||valor<0||valor>100000)falhar(`${campo} inválido.`);
      registro[campo]=valor;
    }else if(campo.endsWith('Vigencia'))registro[campo]=data(valor,campo);
    else if(['tecnicoId','contatoId'].includes(campo)&&anterior&&valor===anterior[campo])registro[campo]=valor;
    else registro[campo]=texto(valor,campo,campo==='endereco'?300:180);
  }
  for(const campo of ['tecnicoId','contatoId'])if(registro[campo]&&registro[campo]!==anterior?.[campo]){
    if(!UUID_INFRA.test(registro[campo])||!referencias[campo])falhar(`Selecione um contato cadastrado para ${campo}.`,409);
  }
  if(registro.inicioVigencia&&registro.fimVigencia&&registro.fimVigencia<registro.inicioVigencia)falhar('Fim da vigência anterior ao início.');
  if(tipo==='contato'&&!registro.nome)falhar('Informe o nome do contato.');
  if(tipo==='internet'&&!registro.operadora)falhar('Informe a operadora.');
  if(tipo==='plano-corporativo'&&(!registro.operadora||!registro.nome))falhar('Informe operadora e nome do plano.');
  const anteriorMs=Date.parse(anterior?.atualizadoEm),agoraMs=Date.parse(agora);
  return {...registro,...(anterior?.contrato?{contrato:anterior.contrato}:{}),criadoEm:anterior?.criadoEm||agora,criadoPor:anterior?.criadoPor||String(sessao.sub||''),atualizadoEm:Number.isFinite(anteriorMs)&&anteriorMs>=agoraMs?new Date(anteriorMs+1).toISOString():agora,atualizadoPor:String(sessao.sub||'')};
}
export function infraPermitida(registro,podeValores){
  const campos=Object.hasOwn(CAMPOS,registro?.tipo)?['tipo',...CAMPOS[registro.tipo]]:[];
  return Object.fromEntries([...campos,'criadoEm','criadoPor','atualizadoEm','atualizadoPor','contrato'].filter(k=>Object.hasOwn(registro||{},k)&&(podeValores||!['valorMensal','contrato'].includes(k))).map(k=>[k,registro[k]]));
}
