// Somente leitura local do XLSX. A confirmação de importação usa a API autenticada.
const MESES=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const CABECALHOS=['MÊS','AÇÃO / CAMPANHA','DATA DO EVENTO','CATEGORIA','INÍCIO DA PREPARAÇÃO','IMPLANTAR ATÉ','GERENTE COMERCIAL','RH','PRODUÇÃO','FINANCEIRO','DESIGNER','STATUS','AÇÃO PREVISTA','OBSERVAÇÕES','ORÇAMENTO (R$)'];
const CAMPOS_FONTE=['ano','mes','titulo','categoria','descricao','observacoes','setores','periodo','dataInicio','dataFim','preparacaoInicio','implantarAte','preparacaoRegra'];
const MAX_ARQUIVO=5*1024*1024;
const texto=x=>x===null||x===undefined?'':x instanceof Date?x.toISOString().slice(0,10):String(x).trim();
const normalizar=x=>texto(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const igual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clonar=x=>structuredClone(x);
const vazia=x=>x===null||x===undefined||x==='';
const iso=(ano,mes,dia)=>`${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;

function dataISO(value,local){
 if(vazia(value))return '';
 if(value instanceof Date){if(!Number.isFinite(+value))throw Error(`${local}: data inválida.`);return value.toISOString().slice(0,10);}
 const s=texto(value),br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),en=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!br&&!en)throw Error(`${local}: data inválida. Use dia/mês/ano.`);
 const [ano,mes,dia]=br?[Number(br[3]),Number(br[2]),Number(br[1])]:[Number(en[1]),Number(en[2]),Number(en[3])];
 const d=new Date(Date.UTC(ano,mes-1,dia));
 if(ano<2000||ano>2200||d.getUTCFullYear()!==ano||d.getUTCMonth()!==mes-1||d.getUTCDate()!==dia)throw Error(`${local}: data inválida.`);
 return iso(ano,mes,dia);
}
function valorCentavos(value,local){
 if(vazia(value))return null;
 let n;
 if(typeof value==='number')n=value;
 else{
  const s=texto(value).replace(/^R\$\s*/i,'').replace(/\u00a0/g,'');
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))throw Error(`${local}: orçamento inválido. Informe um valor em reais ou deixe em branco.`);
  n=Number(s.replaceAll('.','').replace(',','.'));
 }
 const cents=Math.round(n*100);
 if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(cents)||Math.abs(n*100-cents)>0.000001)throw Error(`${local}: orçamento inválido. Use até duas casas decimais.`);
 return cents;
}
async function idDaChave(chave){
 const hash=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(chave))).slice(0,16);
 hash[6]=(hash[6]&0x0f)|0x80;hash[8]=(hash[8]&0x3f)|0x80;
 const s=[...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
function anoDoPlano(rows,headerIndex,arquivo){
 const extrairAnos=value=>[...texto(value).matchAll(/(?:^|[^\d])(\d{4})(?=$|[^\d])/g)].map(m=>Number(m[1]));
 const candidatos=rows.slice(0,headerIndex).flat().filter(x=>/planejamento/i.test(texto(x))).flatMap(extrairAnos);
 const anos=[...new Set(candidatos)];
 if(!anos.length)anos.push(...new Set(extrairAnos(arquivo)));
 if(anos.length!==1)throw Error('Informe um único ano do planejamento no título da planilha.');
 if(anos[0]<2000||anos[0]>2100)throw Error('O ano do planejamento deve estar entre 2000 e 2100.');
 return anos[0];
}
function prepararDataEvento(value,ano,mes,local,avisos){
 const t=normalizar(value);
 if(t==='mes inteiro')return {periodo:'mes',dataInicio:'',dataFim:''};
 if(!t||t.includes('a definir')||t.includes('sem data fixa')){avisos.push(`${local}: dia do evento a definir; nenhuma data foi presumida.`);return {periodo:'a_definir',dataInicio:'',dataFim:''};}
 const data=dataISO(value,local);
 if(Number(data.slice(0,4))!==ano||Number(data.slice(5,7))!==mes)throw Error(`${local}: a data do evento não corresponde ao ano e ao mês informado.`);
 return {periodo:'data',dataInicio:data,dataFim:data};
}
function categoria(value,local,avisos){
 const t=normalizar(value),map={'acao para colaboradores':'colaboradores','colaboradores':'colaboradores','campanha de saude':'saude','saude':'saude','data comercial':'comercial','comercial':'comercial','outro':'outro'};
 if(map[t])return map[t];
 if(t)avisos.push(`${local}: categoria “${texto(value)}” mantida na origem e classificada como Outro para conferência.`);
 return 'outro';
}
function situacao(value,local,avisos){
 const t=normalizar(value),map={'em aberto':'aberta','aberta':'aberta','em preparacao':'preparacao','em execucao':'execucao','concluida':'concluida','cancelada':'cancelada'};
 if(!t)return 'aberta';
 if(map[t])return map[t];
 avisos.push(`${local}: situação “${texto(value)}” não reconhecida; conferir antes de importar.`);return 'aberta';
}
function setores(row,indices,avisos,local){
 const setores=[];
 for(const h of CABECALHOS.slice(6,11)){
  const v=normalizar(row[indices[h]]);
  if(['☑','sim','x','true','1'].includes(v))setores.push(h==='RH'?'RH':h.charAt(0)+h.slice(1).toLowerCase());
  else if(v&&!['☐','nao','false','0'].includes(v))avisos.push(`${local}: marcação do setor ${h} não reconhecida; nenhuma pessoa foi atribuída.`);
 }
 return setores;
}
function referenciasFeriados(sheets,avisos){
 const result=[];
 for(const sheet of sheets.filter(s=>/^feriados\b/.test(normalizar(s.sheet)))){
  const rows=sheet.data||[],header=rows.findIndex(r=>normalizar(r[0])==='data'&&normalizar(r[2])==='referencia');
  if(header<0){avisos.push(`Aba ${sheet.sheet}: referências de feriados não reconhecidas.`);continue;}
  for(let i=header+1;i<rows.length;i++){
   const row=rows[i]||[];if(!texto(row[2]))continue;
   result.push({data:dataISO(row[0],`${sheet.sheet}, linha ${i+1}`),titulo:texto(row[2]),tipo:texto(row[3]),observacoes:texto(row[4]),origem:{aba:sheet.sheet,linha:i+1}});
  }
 }
 if(result.length)avisos.push(`${result.length} referências de feriados/datas comemorativas lidas separadamente; não geram ações nem definem expediente.`);
 return result;
}

/** Normaliza somente a tabela de ações, preservando os textos originais. */
export async function interpretarPlanilhaPlanejamento(sheets,{arquivo=''}={}){
 if(!Array.isArray(sheets)||sheets.length>50)throw Error('Planilha inválida ou com abas demais.');
 const planos=sheets.filter(s=>normalizar(s.sheet)==='plano de acoes');
 if(planos.length!==1)throw Error('Não foi encontrada uma única aba “Plano de ações”.');
 const rows=planos[0].data;
 if(!Array.isArray(rows)||rows.length>2000||rows.some(r=>!Array.isArray(r)||r.length>100))throw Error('A tabela de ações está fora do formato esperado.');
 const header=rows.findIndex(r=>normalizar(r[0])==='mes'&&normalizar(r[1])==='acao / campanha');
 if(header<0)throw Error('Os cabeçalhos da aba “Plano de ações” não foram encontrados.');
 const indices=Object.fromEntries(CABECALHOS.map(h=>[h,rows[header].findIndex(v=>normalizar(v)===normalizar(h))]));
 const faltando=CABECALHOS.filter(h=>indices[h]<0);if(faltando.length)throw Error(`Colunas ausentes: ${faltando.join(', ')}.`);
 const ano=anoDoPlano(rows,header,arquivo),avisos=[],acoes=[],chaves=new Set();
 for(let i=header+1;i<rows.length;i++){
  const row=rows[i],titulo=texto(row[indices['AÇÃO / CAMPANHA']]);if(!titulo)continue;
  const local=`Plano de ações, linha ${i+1}`,m=row[indices['MÊS']],mes=typeof m==='number'?m:MESES.indexOf(normalizar(m))+1;
  if(!Number.isInteger(mes)||mes<1||mes>12)throw Error(`${local}: mês inválido.`);
  const chave=`planejamento:${ano}:${normalizar(titulo)}`;
  if(chaves.has(chave))throw Error(`${local}: ação repetida no mesmo ano (“${titulo}”). Diferencie os títulos antes de importar.`);chaves.add(chave);
  const preparacao=row[indices['INÍCIO DA PREPARAÇÃO']],preparacaoTexto=texto(preparacao);
  let preparacaoInicio='',preparacaoRegra='';
  if(preparacaoTexto){
   if(/^[0-9]{1,3}\s+dias? antes do encerramento$/i.test(preparacaoTexto)){preparacaoRegra=preparacaoTexto;avisos.push(`${local}: preparação relativa preservada; informar o encerramento antes de calcular.`);}
   else if(normalizar(preparacaoTexto)==='a definir')avisos.push(`${local}: início da preparação a definir.`);
   else preparacaoInicio=dataISO(preparacao,`${local}, início da preparação`);
  }
  const prazo=row[indices['IMPLANTAR ATÉ']],implantarAte=normalizar(prazo)==='a definir'?'':dataISO(prazo,`${local}, implantar até`);
  const item={id:await idDaChave(chave),versao:0,ano,mes,titulo,categoria:categoria(row[indices.CATEGORIA],local,avisos),descricao:texto(row[indices['AÇÃO PREVISTA']]),observacoes:texto(row[indices.OBSERVAÇÕES]),setores:setores(row,indices,avisos,local),...prepararDataEvento(row[indices['DATA DO EVENTO']],ano,mes,local,avisos),preparacaoInicio,implantarAte,preparacaoRegra,responsaveis:[],previstoCentavos:valorCentavos(row[indices['ORÇAMENTO (R$)']],local),realizadoCentavos:null,situacao:situacao(row[indices.STATUS],local,avisos),etapas:[],anexos:[],comentarios:[],historico:[]};
  item.origem={tipo:'planilha',chave,arquivo:texto(arquivo),aba:planos[0].sheet,linha:i+1,original:{colunas:CABECALHOS.map(h=>({coluna:h,valor:row[indices[h]] instanceof Date?texto(row[indices[h]]):row[indices[h]]??null}))},campos:Object.fromEntries([...CAMPOS_FONTE,'previstoCentavos','situacao'].map(f=>[f,clonar(item[f])]))};
  acoes.push(item);
 }
 if(!acoes.length)throw Error('Nenhuma ação preenchida foi encontrada na planilha.');
 if(acoes.length>200)throw Error('Importe no máximo 200 ações por arquivo.');
 const feriados=referenciasFeriados(sheets,avisos);
 avisos.unshift(`${acoes.filter(a=>!a.responsaveis.length).length} ações sem responsável do RH; os setores não substituem a seleção de pessoas.`);
 const semValor=acoes.filter(a=>a.previstoCentavos===null).length;if(semValor)avisos.push(`${semValor} ações sem orçamento informado. Valor em branco não será convertido em zero.`);
 return {acoes,feriados,avisos};
}

// Verifica tamanho declarado antes de descompactar; arquivos não são enviados.
function conferirArquivoZip(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);if(bytes.length<22||view.getUint32(0,true)!==0x04034b50)throw Error('O arquivo não é um XLSX válido.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('O arquivo XLSX está incompleto.');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
 if(count>2000||count===0||offset>=end||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('O arquivo XLSX excede os limites de leitura.');
 let total=0,pos=offset;
 for(let i=0;i<count;i++){
  if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)throw Error('Estrutura XLSX inválida.');
  const flags=view.getUint16(pos+8,true),size=view.getUint32(pos+24,true);total+=size;
  if(flags&1||size>20*1024*1024||total>40*1024*1024)throw Error('O conteúdo da planilha é grande demais ou está protegido.');
  pos+=46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
 }
}

export async function lerPlanilhaPlanejamento(file){
 if(!file||!/^.+\.xlsx$/i.test(file.name||''))throw Error('Escolha um arquivo .xlsx do planejamento.');
 if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_ARQUIVO)throw Error('Escolha uma planilha de até 5 MB.');
 const buffer=await file.arrayBuffer();conferirArquivoZip(buffer);
 let sheets;
 try{const {default:readExcelFile}=await import('read-excel-file/universal');sheets=await readExcelFile(buffer);}
 catch{throw Error('Não foi possível ler o XLSX. Confira se o arquivo está íntegro e sem senha.');}
 return interpretarPlanilhaPlanejamento(sheets,{arquivo:file.name});
}

/** Atualiza campos de origem só quando não foram editados na ficha. */
export function conferirImportacao(acoes,itens=[]){
 if(!Array.isArray(acoes)||!Array.isArray(itens))throw Error('Não foi possível comparar a importação.');
 const novas=[],existentes=[],alteradas=[],avisos=[],porChave=new Map(),porId=new Map(),vistas=new Set();
 const chavesRecebidas=new Set(acoes.map(a=>a.origem?.chave));
 for(const item of itens){
  if(item.origem?.chave){if(porChave.has(item.origem.chave))throw Error('Há mais de uma ação com a mesma origem. Confira o cadastro antes de importar.');porChave.set(item.origem.chave,item);}
  porId.set(item.id,item);
 }
 for(const nova of acoes){
  const chave=nova.origem?.chave;if(!chave||vistas.has(chave))throw Error('A importação contém origem ausente ou repetida.');vistas.add(chave);
  const antes=porChave.get(chave),colisao=porId.get(nova.id);
  if(colisao&&colisao.origem?.chave!==chave)throw Error('Identificador em uso por outra origem. Confira antes de importar.');
  if(!antes){
   const renomeadas=itens.filter(a=>a.origem?.campos&&!chavesRecebidas.has(a.origem.chave)&&a.origem.linha===nova.origem.linha&&CAMPOS_FONTE.filter(f=>f!=='titulo').every(f=>igual(a.origem.campos[f],nova[f])));
   if(renomeadas.length)throw Error(`“${nova.titulo}” pode ser uma renomeação de “${renomeadas[0].titulo}”. Mantenha o título de origem na planilha e altere o nome pela ficha para preservar o vínculo; a importação foi interrompida para evitar duplicação.`);
   novas.push({item:clonar(nova),versao:0,diferencas:[],preservados:[]});continue;
  }
  const item=clonar(antes),snapshot=antes.origem?.campos||{},diferencas=[],preservados=[];
  let fonteMudou=false;
  for(const campo of [...CAMPOS_FONTE,'previstoCentavos','situacao']){
   const possui=Object.hasOwn(snapshot,campo),novo=nova[campo],atual=antes[campo];
   if(possui&&igual(snapshot[campo],novo))continue;
   fonteMudou=true;
   if(igual(atual,novo))continue;
   if(CAMPOS_FONTE.includes(campo)&&possui&&igual(atual,snapshot[campo])){item[campo]=clonar(novo);diferencas.push({campo,antes:clonar(atual),depois:clonar(novo)});}
   else preservados.push({campo,atual:clonar(atual),planilha:clonar(novo)});
  }
  if(!fonteMudou){existentes.push({item,versao:antes.versao,diferencas,preservados});continue;}
  item.origem={...clonar(nova.origem),chave};
  alteradas.push({item,versao:antes.versao,diferencas,preservados});
  if(preservados.length)avisos.push(`${antes.titulo}: ${preservados.length} campo(s) preservado(s) na ficha; conferir diferenças antes de importar.`);
 }
 return {novas,existentes,alteradas,avisos};
}
