import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarPlanilhaPlanejamento, conferirImportacao, lerPlanilhaPlanejamento} from '../src/lib/planejamento-importacao.mjs';
import {prepararImportacao,projetarAgenda} from '../supabase/functions/_shared/planejamento.mjs';

const headers=['MÊS','AÇÃO / CAMPANHA','DATA DO EVENTO','CATEGORIA','INÍCIO DA PREPARAÇÃO','IMPLANTAR ATÉ','GERENTE COMERCIAL','RH','PRODUÇÃO','FINANCEIRO','DESIGNER','STATUS','AÇÃO PREVISTA','OBSERVAÇÕES','ORÇAMENTO (R$)'];
const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function linhas(){return [['PLANEJAMENTO DE AÇÕES 2027'],[],[],[],[],headers,...Array.from({length:16},(_,i)=>[meses[i%12],`Ação demonstrativa ${i+1}`,i<4?'Mês inteiro':i<7?`${meses[i%12]} (a definir)`:`15/${String(i%12+1).padStart(2,'0')}/2027`,i%2?'Ação para colaboradores':'Campanha de saúde',i===5?'30 dias antes do encerramento':'',null,'☐','☐','☐','☐','☐','Em aberto',`Descrição ${i+1}`,'',null]),['TOTAL ANUAL PREVISTO',null,null,null,null,null,null,null,null,null,null,null,null,null,0]];}
const sheets=rows=>[{sheet:'Plano de ações',data:rows},{sheet:'Visão anual',data:rows},{sheet:'Painel executivo',data:rows},{sheet:'Feriados 2027',data:[['FERIADOS 2027'],[],[],[],[],['DATA','DIA','REFERÊNCIA','TIPO','OBSERVAÇÃO'],['01/01/2027','sexta-feira','Referência de exemplo','Ponto facultativo','Conferir expediente']]}];

test('importa apenas as 16 ações, com períodos e feriados separados',async()=>{
 const r=await interpretarPlanilhaPlanejamento(sheets(linhas()),{arquivo:'planejamento.xlsx'});
 assert.equal(r.acoes.length,16);assert.equal(r.feriados.length,1);
 assert.equal(r.acoes.filter(a=>a.periodo==='mes').length,4);assert.equal(r.acoes.filter(a=>a.periodo==='a_definir').length,3);assert.equal(r.acoes.filter(a=>a.periodo==='data').length,9);
 assert.equal(r.acoes[0].dataInicio,'');assert.equal(r.acoes[0].dataFim,'');
 assert.equal(r.acoes[4].dataInicio,'');assert.equal(r.acoes[5].preparacaoInicio,'');assert.equal(r.acoes[5].preparacaoRegra,'30 dias antes do encerramento');
 assert.ok(r.acoes.every(a=>a.responsaveis.length===0&&a.previstoCentavos===null));assert.equal(r.acoes[0].origem.linha,7);
 assert.equal(r.feriados[0].tipo,'Ponto facultativo');
});
test('setores marcados não se tornam responsáveis; valor vazio difere de zero',async()=>{
 const rows=linhas();rows[6][7]='☑';rows[6][14]=0;rows[7][14]='R$ 1.234,56';
 const {acoes}=await interpretarPlanilhaPlanejamento(sheets(rows));
 assert.deepEqual(acoes[0].setores,['RH']);assert.deepEqual(acoes[0].responsaveis,[]);assert.equal(acoes[0].previstoCentavos,0);assert.equal(acoes[1].previstoCentavos,123456);assert.equal(acoes[2].previstoCentavos,null);
});
test('IDs são estáveis com linhas reordenadas e nome de arquivo diferente',async()=>{
 const a=await interpretarPlanilhaPlanejamento(sheets(linhas()),{arquivo:'primeiro.xlsx'});
 const rows=linhas();[rows[6],rows[8]]=[rows[8],rows[6]];
 const b=await interpretarPlanilhaPlanejamento(sheets(rows),{arquivo:'segundo.xlsx'});
 assert.equal(a.acoes[0].id,b.acoes[2].id);assert.equal(a.acoes[0].origem.chave,b.acoes[2].origem.chave);
 assert.equal(conferirImportacao(b.acoes,a.acoes).alteradas.length,0);
});
test('recusa datas impossíveis, ano ausente, mês divergente e ações duplicadas',async()=>{
 const invalid=linhas();invalid[13][2]='31/02/2027';await assert.rejects(()=>interpretarPlanilhaPlanejamento(sheets(invalid)),/data inválida/i);
 const month=linhas();month[13][2]='15/01/2027';await assert.rejects(()=>interpretarPlanilhaPlanejamento(sheets(month)),/mês informado/i);
 const year=linhas();year[0]=['PLANEJAMENTO DE AÇÕES'];await assert.rejects(()=>interpretarPlanilhaPlanejamento(sheets(year)),/ano do planejamento/i);
 const duplicate=linhas();duplicate[7][1]=duplicate[6][1];await assert.rejects(()=>interpretarPlanilhaPlanejamento(sheets(duplicate)),/repetida/i);
});
test('recusa orçamento inválido em vez de convertê-lo em zero',async()=>{
 for(const value of ['a combinar',-1,'1.234,567',Infinity]){const rows=linhas();rows[6][14]=value;await assert.rejects(()=>interpretarPlanilhaPlanejamento(sheets(rows)),/orçamento/i);}
});
test('limites de ano e quantidade coincidem com a importação do servidor',async()=>{
 const exemplo=linhas()[6];
 const planilha=(ano,n)=>[{sheet:'Plano de ações',data:[[`PLANEJAMENTO ${ano}`],headers,...Array.from({length:n},(_,i)=>{const row=[...exemplo];row[1]=`Ação limite ${i+1}`;return row;})]}];
 for(const ano of [2000,2100]){
  const r=await interpretarPlanilhaPlanejamento(planilha(ano,200));assert.equal(r.acoes.length,200);
  assert.equal(prepararImportacao(r.acoes.map(item=>({item,versao:0})),[],{gestor:true,usuario:'gestor-teste'},[]).length,200);
 }
 for(const ano of [1999,2101,2200])await assert.rejects(()=>interpretarPlanilhaPlanejamento(planilha(ano,1)),/entre 2000 e 2100/);
 await assert.rejects(()=>interpretarPlanilhaPlanejamento(planilha(2027,201)),/máximo 200 ações/);
 const semAno=planilha(2027,1);semAno[0].data[0]=['PLANEJAMENTO'];
 assert.equal((await interpretarPlanilhaPlanejamento(semAno,{arquivo:'Planejamento_2027_Tabelas.xlsx'})).acoes[0].ano,2027);
});
test('conferência não duplica e mantém valores, execução, RH, arquivos e histórico',async()=>{
 const {acoes}=await interpretarPlanilhaPlanejamento(sheets(linhas()));const anterior={...acoes[0],versao:3,responsaveis:[{rhId:'ficha-teste',idPessoa:'700001',nome:'Pessoa exemplo'}],previstoCentavos:98700,realizadoCentavos:1500,situacao:'execucao',etapas:[{id:'etapa-teste',titulo:'Etapa confirmada'}],anexos:[{id:'arquivo-teste'}],historico:[{tipo:'anterior'}],comentarios:[{texto:'Comentário'}]};
 const repetida=conferirImportacao(acoes,[anterior]);assert.equal(repetida.novas.length,15);assert.equal(repetida.existentes.length,1);assert.equal(repetida.alteradas.length,0);
 const rows=linhas();rows[6][12]='Descrição atualizada';rows[6][14]=999;rows[6][11]='Concluída';
 const novo=await interpretarPlanilhaPlanejamento(sheets(rows));const diff=conferirImportacao(novo.acoes,[anterior]);const item=diff.alteradas[0].item;
 assert.equal(item.descricao,'Descrição atualizada');assert.equal(item.previstoCentavos,98700);assert.equal(item.realizadoCentavos,1500);assert.equal(item.situacao,'execucao');
 for(const f of ['responsaveis','etapas','anexos','historico','comentarios'])assert.deepEqual(item[f],anterior[f]);
 assert.equal(diff.alteradas[0].versao,3);assert.ok(diff.alteradas[0].preservados.some(p=>p.campo==='previstoCentavos'));
});
test('edição humana de campo de origem prevalece e o conflito é explicado',async()=>{
 const {acoes}=await interpretarPlanilhaPlanejamento(sheets(linhas()));const anterior={...acoes[0],versao:2,descricao:'Descrição ajustada na ficha'};
 const rows=linhas();rows[6][12]='Descrição nova da planilha';const nova=await interpretarPlanilhaPlanejamento(sheets(rows));
 const diff=conferirImportacao(nova.acoes,[anterior]);assert.equal(diff.alteradas[0].item.descricao,anterior.descricao);assert.equal(diff.alteradas[0].preservados[0].campo,'descricao');assert.ok(diff.avisos.length);
});
test('ação legada sem snapshot não perde campos e colisão de origem é recusada',async()=>{
 const {acoes}=await interpretarPlanilhaPlanejamento(sheets(linhas()));const legado={...acoes[0],origem:{chave:acoes[0].origem.chave},versao:4,descricao:'Confirmado'};
 assert.equal(conferirImportacao(acoes,[legado]).alteradas[0].item.descricao,'Confirmado');
 assert.throws(()=>conferirImportacao(acoes,[{...legado,origem:{chave:'outra'}}]),/identificador/i);
});
test('arquivo com extensão/tamanho incompatível é recusado antes da leitura',async()=>{
 await assert.rejects(()=>lerPlanilhaPlanejamento({name:'arquivo.xls',size:10}),/xlsx/i);
 await assert.rejects(()=>lerPlanilhaPlanejamento({name:'arquivo.xlsx',size:6*1024*1024}),/5 MB/i);
});
test('título alterado no XLSX não cria silenciosamente uma segunda ação',async()=>{
 const anterior=await interpretarPlanilhaPlanejamento(sheets(linhas()));const rows=linhas();rows[6][1]='Ação demonstrativa renomeada';
 const nova=await interpretarPlanilhaPlanejamento(sheets(rows));assert.throws(()=>conferirImportacao(nova.acoes,anterior.acoes),/renomeação/);
});

function xml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function zipStore(files){
 const locais=[],diretorio=[];let offset=0;
 for(const [name,value] of Object.entries(files)){
  const nome=Buffer.from(name),body=Buffer.from(value);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  crc=(crc^0xffffffff)>>>0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(nome.length,26);
  const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(body.length,20);dir.writeUInt32LE(body.length,24);dir.writeUInt16LE(nome.length,28);dir.writeUInt32LE(offset,42);
  locais.push(local,nome,body);diretorio.push(dir,nome);offset+=local.length+nome.length+body.length;
 }
 const dir=Buffer.concat(diretorio),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locais,dir,end]);
}
function xlsxFicticio(){
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const body=linhas().map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>v===null||v===undefined?'':`<c r="${String.fromCharCode(65+c)}${r+1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`).join('')}</row>`).join('');
 return zipStore({
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plano de ações" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetData>${body}</sheetData></worksheet>`,
 });
}
test('lê arquivo XLSX sintético completo com o mesmo leitor usado no navegador',async()=>{
 const bytes=xlsxFicticio();const r=await lerPlanilhaPlanejamento({name:'exemplo.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)});
 assert.equal(r.acoes.length,16);assert.equal(r.acoes[0].titulo,'Ação demonstrativa 1');assert.equal(r.acoes[0].previstoCentavos,null);
 const preparados=prepararImportacao(r.acoes.map(item=>({item,versao:0})),[],{gestor:true,usuario:'gestor-exemplo',nome:'Gestor Exemplo'},[]);
 assert.equal(preparados.length,16);assert.equal(preparados.filter(a=>a.registro.periodo==='mes').length,4);
 const calendario=projetarAgenda(preparados.map(a=>a.registro),'2027-01');
 assert.equal(calendario.filter(e=>e.periodo==='mes').length,1);assert.equal(calendario.find(e=>e.periodo==='mes').data,'2027-01-01');assert.equal(calendario.find(e=>e.periodo==='mes').dataFim,'2027-01-31');
});
test('XLSX truncado ou com conteúdo declarado excessivo é recusado',async()=>{
 const original=xlsxFicticio(),truncado=original.subarray(0,original.length-10);
 await assert.rejects(()=>lerPlanilhaPlanejamento({name:'exemplo.xlsx',size:truncado.length,arrayBuffer:async()=>truncado.buffer.slice(truncado.byteOffset,truncado.byteOffset+truncado.length)}),/incompleto/);
 const grande=Buffer.from(original);const end=grande.length-22,central=grande.readUInt32LE(end+16);grande.writeUInt32LE(100*1024*1024,central+24);
 await assert.rejects(()=>lerPlanilhaPlanejamento({name:'exemplo.xlsx',size:grande.length,arrayBuffer:async()=>grande.buffer.slice(grande.byteOffset,grande.byteOffset+grande.length)}),/grande demais/);
});
